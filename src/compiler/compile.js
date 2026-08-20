// @ts-check

const {IRGenerator} = require('./irgen');
const {IROptimizer} = require('./iroptimizer');
const JSGenerator = require('./jsgen');

const compile = (/** @type {import("../engine/thread")} */ thread) => {
    const irGenerator = new IRGenerator(thread);
    const ir = irGenerator.generate();

    const irOptimizer = new IROptimizer(ir);
    irOptimizer.optimize();

    const procedures = {};
    const target = thread.target;

    const compileScript = (/** @type {import("./intermediate").IntermediateScript} */ script) => {
        if (script.cachedCompileResult) {
            return script.cachedCompileResult;
        }

        // Global (cross-target) procedures execute in their defining target's
        // context (the stage), not the calling target's context ("谁定义谁动").
        const scriptTarget = script.isGlobal ? target.runtime.getTargetForStage() : target;
        const compiler = new JSGenerator(script, ir, scriptTarget);
        const result = compiler.compile();
        script.cachedCompileResult = result;
        return result;
    };

    const entry = compileScript(ir.entry);

    for (const procedureVariant of Object.keys(ir.procedures)) {
        const procedureData = ir.procedures[procedureVariant];
        const procedureTree = compileScript(procedureData);
        procedures[procedureVariant] = procedureTree;
    }

    return {
        startingFunction: entry,
        procedures,
        executableHat: ir.entry.executableHat,
        usesGlobalProcedures: irGenerator.usesGlobalProcedures
    };
};

module.exports = compile;
