"""
AEGIS DYNAMICS: Python Simulation & Monte-Carlo Evaluation Engine
Autonomous Multi-Agent Search-and-Rescue Architecture

Pure Python 3 simulation implementation with zero external dependencies
for 100% reproducible command-line verification and mathematical benchmarking.
"""

import math
import random
from typing import List, Dict, Tuple, Set


class Survivor:
    def __init__(self, survivor_id: int, x: float, y: float):
        self.id = survivor_id
        self.x = x
        self.y = y
        self.found = False
        self.found_at = None
        self.found_by = None


class Drone:
    def __init__(self, drone_id: int, x: float, y: float, speed: float = 20.0):
        self.id = drone_id
        self.callsign = f"ALPHA-{drone_id:02d}"
        self.x = x
        self.y = y
        self.vx = 0.0
        self.vy = speed
        self.target_x = x
        self.target_y = y + 500.0
        self.speed = speed
        self.battery = 100.0
        self.status = "ACTIVE"  # "ACTIVE", "DEAD", "RTL"
        self.last_heard_from: Dict[int, float] = {drone_id: 0.0}
        
        # Lawnmower parameters
        self.lawnmower_dir = 1
        self.lawnmower_lane_x = x
        self.lawnmower_max_y = 4800.0
        self.lawnmower_min_y = 200.0
        self.lawnmower_step_x = 480.0


class SwarmEnvironment:
    def __init__(
        self,
        map_size: float = 5000.0,
        grid_res: int = 50,
        drone_count: int = 10,
        comm_radius: float = 1200.0,
        sensor_radius: float = 250.0,
        algorithm: str = "aegis",
        enable_gossip: bool = True,
        sensor_noise: bool = False
    ):
        self.map_size = map_size
        self.grid_res = grid_res
        self.cell_size = map_size / grid_res
        self.drone_count = drone_count
        self.comm_radius = comm_radius if enable_gossip else 0.0
        self.sensor_radius = sensor_radius
        self.algorithm = algorithm
        self.enable_gossip = enable_gossip
        self.sensor_noise = sensor_noise
        
        self.sim_time = 0.0
        self.time_step = 2.0  # 2s discrete steps for fast Monte-Carlo batching
        
        # Grids
        total_cells = grid_res * grid_res
        self.prior_probability = [0.05] * total_cells
        self.explored_mask = [0] * total_cells
        self.local_beliefs: Dict[int, List[float]] = {}
        
        self.drones: List[Drone] = []
        self.survivors: List[Survivor] = []
        self.packets_exchanged = 0
        
        self._init_scenario()
        self._init_drones()

    def _init_scenario(self):
        # Clustered Avalanche / Disaster Debris Path (Realistic High-Risk Hotspots in Upper Half of Grid)
        # Hotspots are located away from the base station (y >= 1500m to 4200m)
        hotspots = [
            (2500.0, 3200.0, 700.0, 0.95),
            (3600.0, 2200.0, 600.0, 0.85),
            (1400.0, 3800.0, 650.0, 0.80)
        ]
        
        # 10 victims placed within specific debris sectors
        # Note: Some victims are in lanes 2, 4, 7, 9
        seeds = [
            (2400.0, 3100.0), (2550.0, 3300.0), (2650.0, 3450.0), (3500.0, 2150.0),
            (3700.0, 2350.0), (1350.0, 3700.0), (1500.0, 3900.0), (1600.0, 3750.0),
            (2900.0, 2700.0), (3200.0, 2900.0)
        ]
        for sid, (sx, sy) in enumerate(seeds, 1):
            self.survivors.append(Survivor(sid, sx, sy))
            
        N = self.grid_res
        for r in range(N):
            for c in range(N):
                cx = (c + 0.5) * self.cell_size
                cy = (r + 0.5) * self.cell_size
                p = 0.04
                for hx, hy, sigma, weight in hotspots:
                    d2 = (cx - hx) ** 2 + (cy - hy) ** 2
                    p += weight * math.exp(-d2 / (2.0 * sigma * sigma))
                p = min(0.95, p)
                idx = r * N + c
                self.prior_probability[idx] = p

    def _init_drones(self):
        self.drones = []
        N = self.drone_count
        for i in range(N):
            start_x = 400.0 + (i * (self.map_size - 800.0)) / max(1, N - 1)
            start_y = 200.0
            d = Drone(i + 1, start_x, start_y)
            self.drones.append(d)
            self.local_beliefs[d.id] = list(self.prior_probability)

    def step(self):
        self.sim_time += self.time_step
        
        # 1. Update Drone Movement & Local Sensing
        for d in self.drones:
            if d.status == "DEAD":
                continue
            
            d.battery = max(0.0, d.battery - (0.025 * self.time_step))
            if d.battery <= 5.0:
                d.status = "RTL"
                
            self._move_drone(d)
            self._scan_and_update(d)
            
        # 2. Inter-Drone RF Mesh Communication
        if self.algorithm == "aegis" and self.enable_gossip:
            self._run_mesh_gossip()
            self._detect_failures_and_reallocate()

    def _move_drone(self, drone: Drone):
        dist_step = drone.speed * self.time_step
        
        if self.algorithm == "lawnmower":
            # Static Sector Allocation: Each drone is confined to its assigned 500m slice
            sector_min_x = (drone.id - 1) * (self.map_size / self.drone_count) + 125.0
            sector_max_x = drone.id * (self.map_size / self.drone_count) - 125.0
            
            target_y = drone.lawnmower_max_y if drone.lawnmower_dir == 1 else drone.lawnmower_min_y
            dy = target_y - drone.y
            if abs(dy) > dist_step:
                drone.y += math.copysign(dist_step, dy)
            else:
                drone.y = target_y
                drone.lawnmower_dir *= -1
                # Sweep back and forth inside assigned 500m sector only (cannot dynamically expand)
                if drone.lawnmower_lane_x < (sector_min_x + sector_max_x) / 2.0:
                    drone.lawnmower_lane_x = sector_max_x
                else:
                    drone.lawnmower_lane_x = sector_min_x
                    
            dx = drone.lawnmower_lane_x - drone.x
            drone.x += math.copysign(min(abs(dx), dist_step * 0.5), dx)
            return

        # AEGIS Info-Gain Waypoint Selection
        dist_to_target = math.hypot(drone.target_x - drone.x, drone.target_y - drone.y)
        if dist_to_target < 150.0 or int(self.sim_time) % 6 < self.time_step:
            self._pick_info_gain_waypoint(drone)
            
        dir_x = drone.target_x - drone.x
        dir_y = drone.target_y - drone.y
        length = math.hypot(dir_x, dir_y) or 1.0
        dir_x /= length
        dir_y /= length
        
        # Potential Field Repulsion from Peers
        rep_x, rep_y = 0.0, 0.0
        for peer in self.drones:
            if peer.id == drone.id or peer.status == "DEAD":
                continue
            pd = math.hypot(drone.x - peer.x, drone.y - peer.y)
            if 1.0 < pd < 400.0:
                factor = (400.0 - pd) / 400.0
                rep_x += ((drone.x - peer.x) / pd) * factor * 1.5
                rep_y += ((drone.y - peer.y) / pd) * factor * 1.5
                
        final_vx = dir_x + rep_x
        final_vy = dir_y + rep_y
        flen = math.hypot(final_vx, final_vy) or 1.0
        
        drone.vx = (final_vx / flen) * drone.speed
        drone.vy = (final_vy / flen) * drone.speed
        
        drone.x = max(150.0, min(self.map_size - 150.0, drone.x + drone.vx * self.time_step))
        drone.y = max(150.0, min(self.map_size - 150.0, drone.y + drone.vy * self.time_step))

    def _pick_info_gain_waypoint(self, drone: Drone):
        N = self.grid_res
        best_score = -1e9
        best_x = drone.x
        best_y = drone.y
        
        stride = 2
        for r in range(2, N - 2, stride):
            for c in range(2, N - 2, stride):
                idx = r * N + c
                p = self.local_beliefs[drone.id][idx]
                if p < 0.01:
                    continue
                    
                p_clamped = max(1e-4, min(1.0 - 1e-4, p))
                entropy = -(p_clamped * math.log2(p_clamped) + (1.0 - p_clamped) * math.log2(1.0 - p_clamped))
                
                cx = (c + 0.5) * self.cell_size
                cy = (r + 0.5) * self.cell_size
                dist = math.hypot(cx - drone.x, cy - drone.y) + 300.0
                
                # Check if another drone has claim on this sector
                peer_penalty = 1.0
                for peer in self.drones:
                    if peer.id == drone.id or peer.status == "DEAD":
                        continue
                    if math.hypot(cx - peer.x, cy - peer.y) < dist * 0.75:
                        peer_penalty = 0.2
                        break
                        
                # Strong Bayesian prioritization: target highest probability survivor zones first
                score = (p * p * entropy * peer_penalty * 5000.0) / (dist ** 0.8)
                if score > best_score:
                    best_score = score
                    best_x = cx
                    best_y = cy
                    
        drone.target_x = best_x
        drone.target_y = best_y

    def _scan_and_update(self, drone: Drone):
        N = self.grid_res
        r_cells = int(math.ceil(self.sensor_radius / self.cell_size))
        center_col = int(drone.x // self.cell_size)
        center_row = int(drone.y // self.cell_size)
        
        tp_rate = 0.82 if self.sensor_noise else 0.92
        fp_rate = 0.08 if self.sensor_noise else 0.04
        
        for dr in range(-r_cells, r_cells + 1):
            for dc in range(-r_cells, r_cells + 1):
                r = center_row + dr
                c = center_col + dc
                if not (0 <= r < N and 0 <= c < N):
                    continue
                    
                cx = (c + 0.5) * self.cell_size
                cy = (r + 0.5) * self.cell_size
                if math.hypot(cx - drone.x, cy - drone.y) <= self.sensor_radius:
                    idx = r * N + c
                    self.explored_mask[idx] = 1
                    
                    # Check survivors
                    victim_present = None
                    for s in self.survivors:
                        if not s.found and math.hypot(s.x - cx, s.y - cy) < self.cell_size * 0.9:
                            victim_present = s
                            break
                            
                    obs = 1 if (victim_present and random.random() < tp_rate) or (not victim_present and random.random() < fp_rate) else 0
                    
                    # Bayesian Likelihood Update
                    prior = self.local_beliefs[drone.id][idx]
                    if obs == 1:
                        pz = tp_rate * prior + fp_rate * (1.0 - prior)
                        updated = (tp_rate * prior) / (pz or 1e-4)
                    else:
                        pz = (1.0 - tp_rate) * prior + (1.0 - fp_rate) * (1.0 - prior)
                        updated = ((1.0 - tp_rate) * prior) / (pz or 1e-4)
                        
                    self.local_beliefs[drone.id][idx] = max(0.005, min(0.99, updated))
                    
                    if victim_present and not victim_present.found and updated > 0.65:
                        victim_present.found = True
                        victim_present.found_at = self.sim_time
                        victim_present.found_by = drone.callsign

    def _run_mesh_gossip(self):
        N = len(self.drones)
        for i in range(N):
            dA = self.drones[i]
            if dA.status == "DEAD":
                continue
            dA.last_heard_from[dA.id] = self.sim_time
            
            for j in range(i + 1, N):
                dB = self.drones[j]
                if dB.status == "DEAD":
                    continue
                    
                dist = math.hypot(dA.x - dB.x, dA.y - dB.y)
                if dist <= self.comm_radius:
                    self.packets_exchanged += 2
                    dA.last_heard_from[dB.id] = self.sim_time
                    dB.last_heard_from[dA.id] = self.sim_time
                    
                    # Belief map fusion (linear opinion pool)
                    grid_len = len(self.explored_mask)
                    beliefA = self.local_beliefs[dA.id]
                    beliefB = self.local_beliefs[dB.id]
                    for k in range(0, grid_len, 3):
                        fused = (beliefA[k] + beliefB[k]) * 0.5
                        beliefA[k] = fused
                        beliefB[k] = fused

    def _detect_failures_and_reallocate(self):
        for drone in self.drones:
            if drone.status == "DEAD":
                continue
            dead_detected = False
            for peer in self.drones:
                if peer.id == drone.id:
                    continue
                last_t = drone.last_heard_from.get(peer.id, 0.0)
                if peer.status == "DEAD" or (self.sim_time - last_t > 14.0 and self.sim_time > 15.0):
                    dead_detected = True
                    break
            if dead_detected and int(self.sim_time) % 4 < self.time_step:
                self._pick_info_gain_waypoint(drone)

    def inject_drone_failures(self, fraction: float = 0.3):
        active = [d for d in self.drones if d.status == "ACTIVE"]
        kill_count = max(1, round(len(active) * fraction))
        random.shuffle(active)
        for d in active[:kill_count]:
            d.status = "DEAD"
            d.battery = 0.0

    def get_coverage_percent(self) -> float:
        total = len(self.explored_mask)
        explored = sum(self.explored_mask)
        return (explored / total) * 100.0

    def get_metrics(self) -> Dict[str, float]:
        found_times = [s.found_at for s in self.survivors if s.found and s.found_at is not None]
        mtft = (sum(found_times) / len(found_times)) if found_times else self.sim_time
        return {
            "sim_time": self.sim_time,
            "coverage_pct": self.get_coverage_percent(),
            "survivors_found": len(found_times),
            "survivors_total": len(self.survivors),
            "recall_pct": (len(found_times) / len(self.survivors)) * 100.0,
            "mtft_sec": mtft,
            "packets": self.packets_exchanged
        }
