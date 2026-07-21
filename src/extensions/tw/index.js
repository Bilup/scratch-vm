const formatMessage = require('format-message');
const BlockType = require('../../extension-support/block-type');
const ArgumentType = require('../../extension-support/argument-type');
const Cast = require('../../util/cast');

// eslint-disable-next-line max-len
const iconURI = `data:image/svg+xml;base64,PHN2ZyB2ZXJzaW9uPSIxLjEiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyIgeG1sbnM6eGxpbms9Imh0dHA6Ly93d3cudzMub3JnLzE5OTkveGxpbmsiIHdpZHRoPSIzMiIgaGVpZ2h0PSIzMiIgdmlld0JveD0iLTAuMjUsLTAuMjUsMTMwLjcwNDMzLDEyOC45MzY1NyI+PGcgdHJhbnNmb3JtPSJ0cmFuc2xhdGUoLTE3NS43ODE3MiwtMTE1Ljc4MTcyKSI+PGcgZmlsbD0iI2ZmZmZmZiIgc3Ryb2tlPSIjNzRjMGM0IiBzdHJva2Utd2lkdGg9IjIuNSIgc3Ryb2tlLW1pdGVybGltaXQ9IjEwIj48cGF0aCBkPSJNMjA4LjM5MDg2LDExNi43ODE3Mmg0NC4yNTI4bC0xMi42NDM2NiwxMi42NDM2NmgtMjUuMjg3MzFsLTI1LjI4NzMxLDI1LjI4NzMxdjUwLjU3NDYzbC0xMi42NDM2NiwtMTIuNjQzNjZ2LTQ0LjI1MjhsMzEuNjA5MTQsLTMxLjYwOTE0TTE3Ni43ODE3MiwyMDUuMjg3MzF2MzcuOTMwOTdoMTIuNjQzNjZ2LTI1LjI4NzMxbC0xMi42NDM2NiwtMTIuNjQzNjZNMjY1LjI4NzMxLDExNi43ODE3MmgzNy45MzA5N2wtMzcuOTMwOTcsMzcuOTMwOTdoLTM3LjkzMDk3bC0xMi42NDM2NiwxMi42NDM2NnY1MC41NzQ2M2wtMTIuNjQzNjYsMTIuNjQzNjZ2LTY5LjU0MDExbDE4Ljk2NTQ5LC0xOC45NjU0OWgzNy45MzA5N2wxMi42NDM2NiwtMTIuNjQzNjZoLTE4Ljk2NTQ5bDEyLjY0MzY2LC0xMi42NDM2Nk0yMDIuMDY5MDMsMjQzLjIxODI4bDEyLjY0MzY2LC0xMi42NDM2Nmg1Ni44OTY0NmwxOC45NjU0OSwtMTguOTY1NDl2LTE4Ljk2NTQ5aC0yNS4yODczMWwxMi42NDM2NiwtMTIuNjQzNjZoMjUuMjg3MzF2MzcuOTMwOTdsLTI1LjI4NzMxLDI1LjI4NzMxaC03NS44NjE5NE0zMDMuMjE4MjgsMTI5LjQyNTM3djEyLjY0MzY2bC01MC41NzQ2Myw1MC41NzQ2M2gtMTIuNjQzNjZ6Ii8+PC9nPjwvZz48L3N2Zz48IS0tcm90YXRpb25DZW50ZXI6NjQuMjE4MjgzNzQ4MDA3NTE6NjQuMjE4MjgzNzQ4MDA3NzQtLT4=`;

/**
 * Class for Bilup blocks
 * @constructor
 */
class BilupBlocks {
    constructor (runtime) {
        /**
         * The runtime instantiating this block package.
         * @type {Runtime}
         */
        this.runtime = runtime;
    }

    /**
     * @returns {object} metadata for this extension and its blocks.
     */
    getInfo () {
        return {
            id: 'tw',
            name: 'Bilup',
            color1: '#ff4c4c',
            color2: '#e64444',
            color3: '#c73a3a',
            docsURI: 'https://docs.bilup.org/blocks',
            menuIconURI: iconURI,
            blockIconURI: iconURI,
            blocks: [
                {
                    opcode: 'getLastKeyPressed',
                    text: formatMessage({
                        id: 'tw.blocks.lastKeyPressed',
                        default: 'last key pressed',
                        description: 'Block that returns the last key that was pressed'
                    }),
                    blockType: BlockType.REPORTER
                },
                {
                    opcode: 'getButtonIsDown',
                    text: formatMessage({
                        id: 'tw.blocks.buttonIsDown',
                        default: '[MOUSE_BUTTON] mouse button down?',
                        description: 'Block that returns whether a specific mouse button is down'
                    }),
                    blockType: BlockType.BOOLEAN,
                    arguments: {
                        MOUSE_BUTTON: {
                            type: ArgumentType.NUMBER,
                            menu: 'mouseButton',
                            defaultValue: '0'
                        }
                    }
                }
            ],
            menus: {
                mouseButton: {
                    items: [
                        {
                            text: formatMessage({
                                id: 'tw.blocks.mouseButton.primary',
                                default: '(0) primary',
                                description: 'Dropdown item to select primary (usually left) mouse button'
                            }),
                            value: '0'
                        },
                        {
                            text: formatMessage({
                                id: 'tw.blocks.mouseButton.middle',
                                default: '(1) middle',
                                description: 'Dropdown item to select middle mouse button'
                            }),
                            value: '1'
                        },
                        {
                            text: formatMessage({
                                id: 'tw.blocks.mouseButton.secondary',
                                default: '(2) secondary',
                                description: 'Dropdown item to select secondary (usually right) mouse button'
                            }),
                            value: '2'
                        }
                    ],
                    acceptReporters: true
                }
            }
        };
    }

    getLastKeyPressed (args, util) {
        return util.ioQuery('keyboard', 'getLastKeyPressed');
    }

    getButtonIsDown (args, util) {
        const button = Cast.toNumber(args.MOUSE_BUTTON);
        return util.ioQuery('mouse', 'getButtonIsDown', [button]);
    }
}

module.exports = BilupBlocks;
