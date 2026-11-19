
const readline = require("node:readline/promises");
const { stdin, stdout } = require("node:process");
const { performance } = require("node:perf_hooks");
const { URL } = require("node:url");

// ==========================================
// 1. TERMINAL INPUT INTERFACE
// ==========================================

const rl = readline.createInterface({
    input: stdin,
    output: stdout
});

// ==========================================
// 2. SEND ONE HTTP REQUEST
// ==========================================

async function sendRequest(url) {
    const start = performance.now();

    try {
        const response = await fetch(url, {
            method: "GET",
            signal: AbortSignal.timeout(10000)
        });

        // Consume the complete response body.
        await response.arrayBuffer();

        const end = performance.now();

        return {
            success: response.ok,
            statusCode: response.status,
            duration: end - start,
            error: null
        };

    } catch (error) {
        const end = performance.now();

        return {
            success: false,
            statusCode: null,
            duration: end - start,
            error:
                error.name === "TimeoutError"
                    ? "Request timed out"
                    : error.message
        };
    }
}

// ==========================================
// 3. CREATE A SHARED REQUEST COUNTER
// ==========================================

function createRequestCounter() {
    let current = 0;

    return function getNextIndex() {
        return current++;
    };
}

// ==========================================
// 4. WORKER FUNCTION
// ==========================================

async function runWorker(
    url,
    totalRequests,
    results,
    getNextIndex
) {
    while (true) {
        const requestNumber = getNextIndex();

        if (requestNumber >= totalRequests) {
            return;
        }

        const result = await sendRequest(url);

        results.push({
            requestNumber: requestNumber + 1,
            ...result // important speed operator h yeh 
        });
    }
}

// ==========================================
// 5. RUN THE LOAD TEST
// ==========================================

async function runLoadTest(url, totalRequests, concurrency) {
    const results = [];

    const getNextIndex = createRequestCounter();

    const workers = [];

    const start = performance.now();

    // Create the required number of workers.
    for (let i = 0; i < concurrency; i++) {
        workers.push(
            runWorker(
                url,
                totalRequests,
                results,
                getNextIndex
            )
        );
    }

    // Wait until all workers finish.
    await Promise.all(workers);

    const end = performance.now();

    return {
        results,
        totalTime: end - start
    };
}

// ==========================================
// 6. CALCULATE PERCENTILES
// ==========================================

function calculatePercentile(values, percentile) {
    if (values.length === 0) {
        return 0;
    }

    const sorted = [...values].sort((a, b) => a - b);

    const index =
        Math.ceil((percentile / 100) * sorted.length) - 1;

    return sorted[Math.max(0, index)];
}

// ==========================================
// 7. CALCULATE PERFORMANCE STATISTICS
// ==========================================

function calculateStatistics(results, totalTime) {
    const durations = results.map(
        result => result.duration
    );

    const successful = results.filter(
        result => result.success
    );

    const failed = results.filter(
        result => !result.success
    );

    const total = results.length;

    const sum = durations.reduce(
        (accumulator, duration) => accumulator + duration,
        0
    );

    const average = total > 0 ? sum / total : 0;

    const minimum =
        total > 0 ? Math.min(...durations) : 0;

    const maximum =
        total > 0 ? Math.max(...durations) : 0;

    const requestsPerSecond =
        totalTime > 0
            ? (total / totalTime) * 1000
            : 0;

    const successRate =
        total > 0
            ? (successful.length / total) * 100
            : 0;

    // Count HTTP status codes.
    const statusCodes = {};

    for (const result of results) {
        if (result.statusCode !== null) {
            const code = result.statusCode;

            statusCodes[code] =
                (statusCodes[code] || 0) + 1;
        }
    }

    return {
        totalRequests: total,
        successfulRequests: successful.length,
        failedRequests: failed.length,
        successRate,
        averageLatency: average,
        minimumLatency: minimum,
        maximumLatency: maximum,
        p50: calculatePercentile(durations, 50),
        p95: calculatePercentile(durations, 95),
        p99: calculatePercentile(durations, 99),
        requestsPerSecond,
        statusCodes
    };
}

// ==========================================
// 8. DISPLAY PERFORMANCE REPORT
// ==========================================

function displayReport(stats, totalTime) {
    console.log("\n");
    console.log("======================================");
    console.log("          LOAD TEST REPORT");
    console.log("======================================");

    console.log(
        `Total Requests       : ${stats.totalRequests}`
    );

    console.log(
        `Successful Requests  : ${stats.successfulRequests}`
    );

    console.log(
        `Failed Requests      : ${stats.failedRequests}`
    );

    console.log(
        `Success Rate         : ${stats.successRate.toFixed(2)}%`
    );

    console.log("--------------------------------------");

    console.log(
        `Total Test Time      : ${(totalTime / 1000).toFixed(2)} seconds`
    );

    console.log(
        `Average Latency      : ${stats.averageLatency.toFixed(2)} ms`
    );

    console.log(
        `Minimum Latency      : ${stats.minimumLatency.toFixed(2)} ms`
    );

    console.log(
        `Maximum Latency      : ${stats.maximumLatency.toFixed(2)} ms`
    );

    console.log("--------------------------------------");

    console.log(
        `p50 Latency          : ${stats.p50.toFixed(2)} ms`
    );

    console.log(
        `p95 Latency          : ${stats.p95.toFixed(2)} ms`
    );

    console.log(
        `p99 Latency          : ${stats.p99.toFixed(2)} ms`
    );

    console.log("--------------------------------------");

    console.log(
        `Requests Per Second  : ${stats.requestsPerSecond.toFixed(2)}`
    );

    console.log("--------------------------------------");

    console.log("HTTP STATUS CODE DISTRIBUTION:");

    if (Object.keys(stats.statusCodes).length === 0) {
        console.log("No HTTP responses received.");
    } else {
        for (const [code, count] of Object.entries(stats.statusCodes)) {
            console.log(`Status ${code} : ${count} requests`);
        }
    }

    console.log("======================================\n");
}

// ==========================================
// 9. MAIN APPLICATION
// ==========================================

async function main() {
    try {
        console.log("\n======================================");
        console.log("          HTTP LOAD TESTER");
        console.log("======================================\n");

        // Get target URL.
        const urlInput = await rl.question(
            "Enter target URL: "
        );

        const parsedURL = new URL(urlInput.trim());

        if (
            parsedURL.protocol !== "http:" &&
            parsedURL.protocol !== "https:"
        ) {
            throw new Error(
                "Only HTTP and HTTPS URLs are supported."
            );
        }

        // Get total requests.
        const totalInput = await rl.question(
            "Enter total number of requests: "
        );

        // Get concurrency.
        const concurrencyInput = await rl.question(
            "Enter concurrency level: "
        );

        const totalRequests = Number(totalInput);

        const requestedConcurrency =
            Number(concurrencyInput);

        // Validate total requests.
        if (
            !Number.isSafeInteger(totalRequests) ||
            totalRequests < 1 ||
            totalRequests > 10000
        ) {
            throw new Error(
                "Requests must be an integer between 1 and 10000."
            );
        }

        // Validate concurrency.
        if (
            !Number.isSafeInteger(requestedConcurrency) ||
            requestedConcurrency < 1 ||
            requestedConcurrency > 1000
        ) {
            throw new Error(
                "Concurrency must be an integer between 1 and 1000."
            );
        }

        // Concurrency cannot exceed total requests.
        const concurrency = Math.min(
            requestedConcurrency,
            totalRequests
        );

        console.log("\n======================================");
        console.log("          TEST CONFIGURATION");
        console.log("======================================");

        console.log(`Target URL    : ${parsedURL.href}`);
        console.log(`Total Requests: ${totalRequests}`);
        console.log(`Concurrency   : ${concurrency}`);

        console.log("\nStarting load test...\n");

        // Execute the load test.
        const { results, totalTime } = await runLoadTest(
            parsedURL.href,
            totalRequests,
            concurrency
        );

        // Calculate statistics.
        const stats = calculateStatistics(
            results,
            totalTime
        );

        // Display report.
        displayReport(stats, totalTime);

    } catch (error) {
        console.error("\nError:", error.message);

    } finally {
        rl.close();
    }
}

// ==========================================
// 10. START APPLICATION
// ==========================================

main();
