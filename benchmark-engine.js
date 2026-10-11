/**
 * AEGIS-SWARM: Benchmark & Evaluation Engine (Client-Side)
 * Runs automated Monte-Carlo batch trials to evaluate against Lawnmower baseline
 * and measures robustness under 30% drone failure.
 */

class SwarmBenchmarkRunner {
  constructor() {
    this.isRunning = false;
  }

  /**
   * Run a comparative batch benchmark across all conditions
   * @param {number} trialsPerCondition - Number of trials (default 10 for fast UI feedback, up to 50)
   * @param {function} onProgress - Progress callback (percent, statusText)
   */
  async runFullBenchmark(trialsPerCondition = 10, onProgress = () => {}) {
    this.isRunning = true;

    const conditions = [
      { name: 'AEGIS Swarm (Nominal)', algorithm: 'aegis', failRatio: 0.0, noise: false, gossip: true },
      { name: 'AEGIS Swarm (30% Failure)', algorithm: 'aegis', failRatio: 0.3, noise: false, gossip: true },
      { name: 'Lawnmower Baseline (Nominal)', algorithm: 'lawnmower', failRatio: 0.0, noise: false, gossip: false },
      { name: 'Lawnmower Baseline (30% Failure)', algorithm: 'lawnmower', failRatio: 0.3, noise: false, gossip: false },
      { name: 'Ablation: Swarm w/o Gossip Comm', algorithm: 'aegis', failRatio: 0.0, noise: false, gossip: false },
      { name: 'Ablation: Swarm w/ Sensor Noise', algorithm: 'aegis', failRatio: 0.0, noise: true, gossip: true }
    ];

    const results = [];
    const totalRuns = conditions.length * trialsPerCondition;
    let completedRuns = 0;

    for (const cond of conditions) {
      const trialMetrics = {
        name: cond.name,
        mtftList: [],
        coverageAt10m: [],
        recallList: [],
        packetsList: []
      };

      for (let t = 0; t < trialsPerCondition; t++) {
        // Fast-forward headless simulation for 600 simulated seconds (10 mins)
        const sim = new SwarmSimulation({
          droneCount: 10,
          scenarioType: 'avalanche',
          algorithm: cond.algorithm,
          timeStep: 2.0 // fast calculation step
        });

        if (!cond.gossip) sim.commRadius = 0;
        if (cond.noise) sim.setSensorNoise(true);

        // Run until t = 120s, then inject failures if specified
        for (let s = 0; s < 60; s++) {
          sim.step();
        }

        if (cond.failRatio > 0) {
          sim.injectDroneFailures(cond.failRatio);
        }

        // Run remaining 480 simulated seconds
        for (let s = 0; s < 240; s++) {
          sim.step();
        }

        const stats = sim.getSummaryStatistics();
        const mtftNum = parseFloat(stats.mtftSeconds) || 500;
        trialMetrics.mtftList.push(mtftNum);
        trialMetrics.coverageAt10m.push(parseFloat(stats.coveragePercent));
        trialMetrics.recallList.push(stats.survivorsFound / Math.max(1, stats.survivorsTotal) * 100);
        trialMetrics.packetsList.push(stats.packetsExchanged);

        completedRuns++;
        const pct = Math.round((completedRuns / totalRuns) * 100);
        onProgress(pct, `Testing ${cond.name} [Trial ${t + 1}/${trialsPerCondition}]...`);

        // Yield to event loop to keep UI responsive
        if (completedRuns % 2 === 0) {
          await new Promise(r => setTimeout(r, 0));
        }
      }

      // Compute means and standard deviations
      const mean = arr => arr.reduce((a, b) => a + b, 0) / arr.length;
      const std = (arr, m) => Math.sqrt(arr.reduce((acc, v) => acc + Math.pow(v - m, 2), 0) / arr.length);

      const meanCoverage = mean(trialMetrics.coverageAt10m);
      const meanMtft = mean(trialMetrics.mtftList);
      const meanRecall = mean(trialMetrics.recallList);

      results.push({
        condition: cond.name,
        meanCoverage10m: meanCoverage.toFixed(1) + '%',
        stdCoverage: '±' + std(trialMetrics.coverageAt10m, meanCoverage).toFixed(1) + '%',
        meanMtftSec: meanMtft.toFixed(1) + 's',
        stdMtft: '±' + std(trialMetrics.mtftList, meanMtft).toFixed(1) + 's',
        meanRecall: meanRecall.toFixed(1) + '%',
        packets: Math.round(mean(trialMetrics.packetsList))
      });
    }

    this.isRunning = false;
    return results;
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { SwarmBenchmarkRunner };
}
