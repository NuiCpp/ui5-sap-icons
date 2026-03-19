#!/usr/bin/env node
/**
 * main.mjs
 *
 * For each SAP UI5 icon SVG file, calls xml-to-nui to produce a C++ header
 * file containing an NUI element-creator function.
 *
 * Icon sets processed:
 *   node_modules/@ui5/webcomponents-icons/dist/v5/*.svg
 *     → include/ui5-sap-icons/icons/<name>.hpp   (namespace Ui5Icons)
 *
 *   node_modules/@ui5/webcomponents-icons-business-suite/dist/v2/*.svg
 *     → include/ui5-sap-icons/business-suite/<name>.hpp   (namespace Ui5BusinessSuite)
 *
 *   node_modules/@ui5/webcomponents-icons-tnt/dist/v3/*.svg
 *     → include/ui5-sap-icons/tnt/<name>.hpp   (namespace Ui5Tnt)
 *
 * Usage:
 *   node main.mjs [--concurrency <N>] [--tool <path>]
 *
 * Options:
 *   --concurrency <N>   Maximum parallel xml-to-nui processes (default: 8)
 *   --tool <path>       Path to the xml-to-nui binary
 *                       (default: ./build/tools_bin/xml-to-nui)
 */

import { glob } from "fs/promises";
import { spawn } from "child_process";
import { mkdir } from "fs/promises";
import path from "path";
import { parseArgs } from "util";

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------
const { values: cliArgs } = parseArgs({
    options: {
        concurrency: { type: "string", default: "8" },
        tool: { type: "string", default: "./build/tools_bin/xml-to-nui" },
    },
    strict: false,
});

const TOOL = cliArgs.tool;
const CONCURRENCY = Math.max(1, parseInt(cliArgs.concurrency, 10));

// ---------------------------------------------------------------------------
// Icon set definitions
// ---------------------------------------------------------------------------
const ICON_SETS = [
    {
        glob: "node_modules/@ui5/webcomponents-icons/dist/v5/*.svg",
        outDir: "include/ui5-sap-icons/icons",
        namespace: "Ui5Icons",
    },
    {
        glob: "node_modules/@ui5/webcomponents-icons-business-suite/dist/v2/*.svg",
        outDir: "include/ui5-sap-icons/business-suite",
        namespace: "Ui5BusinessSuite",
    },
    {
        glob: "node_modules/@ui5/webcomponents-icons-tnt/dist/v3/*.svg",
        outDir: "include/ui5-sap-icons/tnt",
        namespace: "Ui5Tnt",
    },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Convert a kebab-case or snake_case filename stem to a valid C++ identifier.
 * e.g. "add-circle" → "add_circle", "my-icon" → "my_icon"
 * Leading digits get a prefix underscore so it remains a valid identifier.
 */
function stemToIdentifier(stem) {
    let id = stem.replace(/[^a-zA-Z0-9_]/g, "_");
    if (/^[0-9]/.test(id)) id = "_" + id;
    return id;
}

/**
 * Spawn xml-to-nui for a single SVG file and return a Promise that resolves
 * when the process exits successfully, or rejects on error / non-zero exit.
 */
function convertFile(svgPath, outPath, namespace, functionName) {
    return new Promise((resolve, reject) => {
        const args = [
            "--input",  svgPath,
            "--output", outPath,
            "--header",                          // generate a header file
            "--namespace", namespace,
            "--function", functionName,
            "--useNamespaceAbbreviations",
        ];

        const proc = spawn(TOOL, args, { stdio: ["ignore", "pipe", "pipe"] });

        let stderr = "";
        proc.stderr.on("data", (d) => (stderr += d.toString()));

        proc.on("error", (err) =>
            reject(new Error(`Failed to start ${TOOL}: ${err.message}`))
        );

        proc.on("close", (code) => {
            if (code === 0) {
                resolve();
            } else {
                reject(
                    new Error(
                        `xml-to-nui exited with code ${code} for ${svgPath}\n${stderr.trim()}`
                    )
                );
            }
        });
    });
}

/**
 * Run at most `limit` async tasks in parallel from an iterable of thunks.
 */
async function pooled(thunks, limit) {
    const results = [];
    const queue = [...thunks];
    let failed = 0;

    async function worker() {
        while (queue.length > 0) {
            const thunk = queue.shift();
            try {
                results.push(await thunk());
            } catch (err) {
                failed++;
                console.error(`  ✗ ${err.message}`);
            }
        }
    }

    const workers = Array.from({ length: Math.min(limit, queue.length) }, worker);
    await Promise.all(workers);

    return { total: results.length + failed, ok: results.length, failed };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
    console.log(`Using tool : ${TOOL}`);
    console.log(`Concurrency: ${CONCURRENCY}\n`);

    let grandTotal = 0, grandOk = 0, grandFailed = 0;

    for (const set of ICON_SETS) {
        console.log(`Processing set: ${set.namespace}`);
        console.log(`  glob   : ${set.glob}`);
        console.log(`  outDir : ${set.outDir}`);

        // Collect matching SVG files
        const svgFiles = [];
        for await (const file of glob(set.glob)) {
            svgFiles.push(file);
        }

        if (svgFiles.length === 0) {
            console.warn(`  ⚠  No SVG files found – skipping.\n`);
            continue;
        }

        console.log(`  Found  : ${svgFiles.length} SVG files`);

        // Ensure output directory exists
        await mkdir(set.outDir, { recursive: true });

        // Build work thunks
        const thunks = svgFiles.map((svgPath) => {
            const stem = path.basename(svgPath, ".svg");
            const fnName = stemToIdentifier(stem);
            const outPath = path.join(set.outDir, `${stem}.hpp`);
            return () => {
                process.stdout.write(`  → ${stem}.hpp\r`);
                return convertFile(svgPath, outPath, set.namespace, fnName);
            };
        });

        const { total, ok, failed } = await pooled(thunks, CONCURRENCY);

        // Clear the progress line
        process.stdout.write(" ".repeat(60) + "\r");
        console.log(`  Done   : ${ok}/${total} converted, ${failed} failed\n`);

        grandTotal += total;
        grandOk += ok;
        grandFailed += failed;
    }

    console.log("─".repeat(50));
    console.log(`Total: ${grandOk}/${grandTotal} converted, ${grandFailed} failed`);

    if (grandFailed > 0) process.exit(1);
}

main().catch((err) => {
    console.error("Fatal:", err.message);
    process.exit(1);
});
