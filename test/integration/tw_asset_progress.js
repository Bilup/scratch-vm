const {test} = require('tap');
const fs = require('fs');
const path = require('path');
const Runtime = require('../../src/engine/runtime');
const VirtualMachine = require('../../src/virtual-machine');
const makeTestStorage = require('../fixtures/make-test-storage');
const AssetUtil = require('../../src/util/tw-asset-util');

test('emitAssetProgress', t => {
    const vm = new VirtualMachine();

    let runtimeOK = false;
    let vmOK = false;
    vm.runtime.on('ASSET_PROGRESS', (finished, total) => {
        t.equal(finished, 1, 'runtime finished');
        t.equal(total, 2, 'runtime total');
        runtimeOK = true;
    });
    vm.on('ASSET_PROGRESS', (finished, total) => {
        t.equal(finished, 1, 'vm finished');
        t.equal(total, 2, 'vm total');
        vmOK = true;
    });

    vm.runtime.totalAssetRequests = 2;
    vm.runtime.finishedAssetRequests = 1;
    vm.runtime.emitAssetProgress();

    t.ok(runtimeOK, 'runtime');
    t.ok(vmOK, 'vm');
    t.end();
});

test('resetProgress', t => {
    t.plan(4);

    const runtime = new Runtime();
    runtime.finishedAssetRequests = 10;
    runtime.totalAssetRequests = 10;

    runtime.on('ASSET_PROGRESS', (finished, total) => {
        t.equal(finished, 0, 'event finished');
        t.equal(total, 0, 'event total');
    });

    runtime.resetProgress();

    t.equal(runtime.finishedAssetRequests, 0, 'property finishedAssetRequests');
    t.equal(runtime.totalAssetRequests, 0, 'property totalAssetRequests');
    t.end();
});

test('dispose', t => {
    t.plan(1);
    const runtime = new Runtime();
    runtime.resetProgress = () => {
        t.pass();
    };
    runtime.dispose();
    t.end();
});

test('wrapAssetRequest', t => {
    const runtime = new Runtime();

    const log = [];
    runtime.on('ASSET_PROGRESS', (finished, total) => {
        log.push([finished, total]);
    });

    Promise.all([
        runtime.wrapAssetRequest(() => Promise.resolve(1)),
        runtime.wrapAssetRequest(() => Promise.resolve(2))
    ]).then(results => {
        t.same(results, [1, 2]);

        // eslint-disable-next-line prefer-promise-reject-errors
        runtime.wrapAssetRequest(() => Promise.reject(3)).catch(error => {
            t.equal(error, 3);
            t.same(log, [
                [0, 1],
                [0, 2],
                [1, 2],
                [2, 2],
                [2, 3],
                [3, 3]
            ]);
            t.end();
        });
    });
});

test('asset util emits progress', t => {
    const runtime = new Runtime();

    const storage = makeTestStorage();
    storage.load = (assetType, assetId) => Promise.resolve({
        assetId
    });
    runtime.attachStorage(storage);

    const log = [];
    runtime.on('ASSET_PROGRESS', (finished, total) => {
        log.push([finished, total]);
    });

    AssetUtil.getByMd5ext(runtime, null, runtime.storage.AssetType.SVG, 'abcdef.svg').then(() => {
        t.same(log, [
            [0, 1],
            [1, 1]
        ]);
        t.end();
    });
});

//  For the next tests, we have some fixtures that contain 2 assets: 1 sound + 1 costume
// We'll just load them and make sure that each deserializer emits reasonable progress events
for (const format of ['sb', 'sb2', 'sb3']) {
    test(format, t => {
        const fixture = fs.readFileSync(path.join(__dirname, `../fixtures/tw-asset-progress.${format}`));
        const vm = new VirtualMachine();
    
        const log = [];
        vm.on('ASSET_PROGRESS', (finished, total) => {
            log.push([finished, total]);
        });
    
        vm.loadProject(fixture)
            .then(() => {
                t.same(log[0], [0, 0], 'loadProject() implies dispose()');
                if (format === 'sb3') {
                    // The fixture holds 2 unique files (1 costume + 1 sound) and
                    // 2 references, and downloads interleave with preparations,
                    // so only the shape of the counter is asserted: it counts
                    // assets, reaching exactly 2 -- never the 4 work units the
                    // preparation pass adds on top.
                    t.same(log[1], [0, 2], 'both unique files are discovered up front');
                    t.ok(log.slice(1).every(([finished, total]) => total === 2 && finished <= 2),
                        'the reported total never counts reference preparations');
                    t.same(log[log.length - 1], [2, 2], 'every unique asset file is reported as loaded');
                } else {
                    t.same(log, [
                        [0, 0], // loadProject() implies dispose()
                        [0, 1],
                        [0, 2],
                        [1, 2],
                        [2, 2]
                    ]);
                }
                t.end();
            });
    });
}
