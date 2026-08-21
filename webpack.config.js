const CopyWebpackPlugin = require('copy-webpack-plugin');
const defaultsDeep = require('lodash.defaultsdeep');
const fs = require('fs');
const path = require('path');

/**
 * Resolve a module path without crashing the whole webpack config when the
 * module is absent. Some package managers (e.g. bun) install git dependencies
 * with a slightly different layout, so a file that normally exists
 * (e.g. scratch-blocks/shim/vertical.js) may be missing.
 * @param {string} modulePath - module id to resolve
 * @return {string|null} resolved absolute path, or null when unavailable
 */
const resolveIfAvailable = modulePath => {
    try {
        return require.resolve(modulePath);
    } catch (e) {
        return null;
    }
};

const base = {
    mode: process.env.NODE_ENV === 'production' ? 'production' : 'development',
    devServer: {
        contentBase: false,
        host: '0.0.0.0',
        port: process.env.PORT || 8073
    },
    devtool: 'cheap-module-source-map',
    output: {
        library: 'VirtualMachine',
        filename: '[name].js'
    },
    module: {
        rules: [{
            test: /\.(js|mjs)$/,
            loader: 'babel-loader',
            include: [
                path.resolve(__dirname, 'src'),
                // rotur-sdk 的 dist/index.mjs 使用了 class fields 语法，
                // webpack 4 无法直接解析，需要交给 babel 转译
                path.resolve(__dirname, 'node_modules', 'rotur-sdk')
            ],
            query: {
                presets: [['@babel/preset-env']]
            }
        },
        {
            test: /\.mp3$/,
            loader: 'file-loader',
            options: {
                outputPath: 'media/music/'
            }
        }]
    },
    plugins: []
};

module.exports = [
    // Web-compatible
    defaultsDeep({}, base, {
        target: 'web',
        entry: {
            'scratch-vm': './src/index.js',
            'scratch-vm.min': './src/index.js'
        },
        output: {
            libraryTarget: 'umd',
            path: path.resolve('dist', 'web')
        },
        module: {
            rules: base.module.rules.concat([
                {
                    test: require.resolve('./src/index.js'),
                    loader: 'expose-loader?VirtualMachine'
                }
            ])
        }
    }),
    // Node-compatible
    defaultsDeep({}, base, {
        target: 'node',
        entry: {
            'scratch-vm': './src/index.js'
        },
        output: {
            libraryTarget: 'commonjs2',
            path: path.resolve('dist', 'node')
        },
        externals: {
            'decode-html': true,
            'format-message': true,
            'htmlparser2': true,
            'scratch-parser': true,
            'socket.io-client': true,
            'text-encoding': true
        }
    }),
    // Playground
    defaultsDeep({}, base, {
        target: 'web',
        entry: {
            'benchmark': './src/playground/benchmark',
            'video-sensing-extension-debug': './src/extensions/scratch3_video_sensing/debug'
        },
        output: {
            path: path.resolve(__dirname, 'playground'),
            filename: '[name].js'
        },
        module: {
            rules: base.module.rules.concat([
                {
                    test: require.resolve('./src/index.js'),
                    loader: 'expose-loader?VirtualMachine'
                },
                {
                    test: require.resolve('./src/extensions/scratch3_video_sensing/debug.js'),
                    loader: 'expose-loader?Scratch3VideoSensingDebug'
                },
                // expose-loader 规则按需启用：第三方包（尤其是通过 bun 等包管理器安装的
                // git 依赖）可能缺少特定子路径文件（如 scratch-blocks/shim/vertical.js）。
                // 此时跳过对应规则，避免 playground 构建在配置加载阶段直接崩溃。
                {
                    test: resolveIfAvailable('stats.js/build/stats.min.js'),
                    loader: 'script-loader'
                },
                {
                    test: resolveIfAvailable('scratch-blocks/shim/vertical.js'),
                    loader: 'expose-loader?Blockly'
                },
                {
                    test: resolveIfAvailable('scratch-audio/src/index.js'),
                    loader: 'expose-loader?AudioEngine'
                },
                {
                    test: resolveIfAvailable('scratch-storage/src/index.js'),
                    loader: 'expose-loader?ScratchStorage'
                },
                {
                    test: resolveIfAvailable('scratch-render/src/index.js'),
                    loader: 'expose-loader?ScratchRender'
                }
            ].filter(rule => rule.test !== null))
        },
        performance: {
            hints: false
        },
        plugins: base.plugins.concat([
            // 只拷贝实际存在的目录：某些包管理器（如 bun）安装 git 依赖时可能缺少部分文件
            new CopyWebpackPlugin([{
                from: 'node_modules/scratch-blocks/media',
                to: 'media'
            }, {
                from: 'node_modules/scratch-storage/dist/web'
            }, {
                from: 'node_modules/scratch-render/dist/web'
            }, {
                from: 'node_modules/@bilup/scratch-svg-renderer/dist/web'
            }, {
                from: 'src/playground'
            }].filter(copy => fs.existsSync(path.resolve(copy.from))))
        ])
    })
];
