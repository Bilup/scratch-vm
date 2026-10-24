const test = require('tap').test;

const Runtime = require('../../src/engine/runtime');
const Blocks = require('../../src/engine/blocks');
const Sprite = require('../../src/sprites/sprite');
const sb3 = require('../../src/serialization/sb3');
const ProjectAssetLoad = require('../../src/serialization/project-asset-load');
const {loadCostume, loadCostumeFromAsset} = require('../../src/import/load-costume');
const {loadSound, loadSoundFromAsset} = require('../../src/import/load-sound');
const makeTestStorage = require('../fixtures/make-test-storage');

const makeRuntime = (storage = makeTestStorage()) => {
    const runtime = new Runtime();
    runtime.attachStorage(storage);
    return runtime;
};

const costumeJson = (name, assetId, md5ext) => ({
    name,
    assetId,
    md5ext,
    dataFormat: md5ext.substring(md5ext.lastIndexOf('.') + 1),
    rotationCenterX: 0,
    rotationCenterY: 0
});

test('asset identity is the file name, not the assetId field', t => {
    t.equal(ProjectAssetLoad.identity('ABC.png', 'ignored', 'png'), 'abc.png',
        'file name wins and is case-folded');
    t.equal(ProjectAssetLoad.identity(null, 'asset-id', 'png'), 'asset-id.png',
        'assetId + format is the fallback');
    t.equal(ProjectAssetLoad.identity('', 'undefined', 'png'), null,
        'the string "undefined" is not an identity');
    t.equal(ProjectAssetLoad.identity(undefined, undefined, undefined), null,
        'a reference with nothing to identify it opts out of caching');
    t.end();
});

test('a costume takes its identity from the asset it actually loaded', async t => {
    const storage = makeTestStorage();
    storage.load = () => Promise.resolve(storage.createAsset(
        storage.AssetType.ImageBitmap, 'jpeg', new Uint8Array([1]), 'abc', false
    ));
    const runtime = makeRuntime(storage);

    // Declared as .jpg, served as jpeg: project.json used to say "abc.jpg"
    // while the zip carried "abc.jpeg".
    const costume = await loadCostume('abc.jpg', {name: 'c'}, runtime);
    t.equal(costume.assetId, 'abc');
    t.equal(costume.dataFormat, 'jpeg');
    t.equal(costume.md5, 'abc.jpeg');
});

test('a sound takes its identity from the asset it actually loaded', async t => {
    const storage = makeTestStorage();
    storage.load = () => Promise.resolve(storage.createAsset(
        storage.AssetType.Sound, 'mp3', new Uint8Array([1]), 'abc', false
    ));
    const runtime = makeRuntime(storage);
    runtime.attachAudioEngine({
        decodeSoundPlayer: () => Promise.resolve({
            id: 1,
            buffer: {sampleRate: 44100, length: 4}
        })
    });

    const sound = await loadSound({name: 's', md5: 'abc.wav', dataFormat: 'wav'}, runtime, null);
    t.equal(sound.assetId, 'abc');
    t.equal(sound.dataFormat, 'mp3');
    t.equal(sound.md5, 'abc.mp3');
});

test('two costumes that share an assetId but not a file do not share an asset', async t => {
    const storage = makeTestStorage();
    const byId = {
        aaa: storage.createAsset(storage.AssetType.ImageBitmap, 'png', new Uint8Array([1]), 'aaa', false),
        bbb: storage.createAsset(storage.AssetType.ImageBitmap, 'png', new Uint8Array([2]), 'bbb', false)
    };
    storage.load = (assetType, assetId) => Promise.resolve(byId[assetId] || null);
    const runtime = makeRuntime(storage);

    const project = {
        targets: [{
            isStage: true,
            name: 'Stage',
            variables: {},
            lists: {},
            broadcasts: {},
            blocks: {},
            comments: {},
            currentCostume: 0,
            costumes: [
                costumeJson('first', 'shared', 'aaa.png'),
                costumeJson('second', 'shared', 'bbb.png')
            ],
            sounds: [],
            layerOrder: 0
        }],
        monitors: [],
        extensions: [],
        meta: {semver: '3.0.0', vm: 'test', agent: 'test'}
    };

    const {targets} = await sb3.deserialize(project, runtime, null);
    const [first, second] = targets[0].sprite.costumes;

    t.not(first.asset, second.asset, 'each reference keeps its own asset');
    t.equal(first.asset.data[0], 1);
    t.equal(second.asset.data[0], 2, 'the second costume is not served the first one\'s image');
    t.equal(first.md5, 'aaa.png');
    t.equal(second.md5, 'bbb.png');
});

test('a costume that arrives late does not undo edits made while it loaded', async t => {
    const storage = makeTestStorage();
    const assets = {
        fast: storage.createAsset(storage.AssetType.ImageBitmap, 'png', new Uint8Array([1]), 'fast', false),
        slow: storage.createAsset(storage.AssetType.ImageBitmap, 'png', new Uint8Array([2]), 'slow', false)
    };
    // Hold the second costume's asset until the test releases it, so the window
    // between "sprite installed" and "all costumes ready" is not a race.
    let releaseSlow;
    const slowGate = new Promise(resolve => {
        releaseSlow = resolve;
    });
    storage.load = (assetType, assetId) => {
        if (assetId === 'slow') {
            return slowGate.then(() => assets.slow);
        }
        return Promise.resolve(assets[assetId] || null);
    };
    const runtime = makeRuntime(storage);

    const spriteJson = {
        isStage: false,
        name: 'Sprite1',
        variables: {},
        lists: {},
        broadcasts: {},
        blocks: {},
        comments: {},
        currentCostume: 0,
        costumes: [
            costumeJson('fast', 'fast', 'fast.png'),
            costumeJson('slow', 'slow', 'slow.png')
        ],
        sounds: [],
        layerOrder: 1
    };

    const {targets} = await sb3.deserialize(spriteJson, runtime, null, true);
    const target = targets[0];
    t.equal(target.sprite.costumes.length, 2, 'the sprite is installed with its full costume list');

    target.addCostume({name: 'added while loading', assetId: 'x', dataFormat: 'png'});
    t.equal(target.sprite.costumes.length, 3);

    releaseSlow();
    // Let the costume chain settle (the list is only touched by then, if at all).
    await new Promise(resolve => setTimeout(resolve, 30));
    t.equal(target.sprite.costumes.length, 3,
        'the late costume list did not replace the one the editor is using');
});

test('switching costume on a target with no costumes does not produce a NaN index', t => {
    const runtime = new Runtime();
    const sprite = new Sprite(new Blocks(runtime), runtime);
    const target = sprite.createClone();
    target.setCostume(3);
    t.equal(target.currentCostume, 0);
    t.end();
});

test('a costume or sound whose asset data was dropped loads without throwing', async t => {
    const runtime = makeRuntime();
    const costume = {name: 'c', skinId: 7, assetId: 'a', dataFormat: 'png', md5: 'a.png', asset: null};
    t.equal(await loadCostumeFromAsset(costume, runtime), costume);
    t.equal(costume.skinId, 7, 'the existing skin is kept');

    const sound = {name: 's', soundId: 3, md5: 'a.wav', asset: null};
    t.equal(await loadSoundFromAsset(sound, null, runtime, null), sound);
    t.equal(sound.soundId, 3, 'the existing player is kept');
});
