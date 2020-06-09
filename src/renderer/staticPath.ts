// const isWeb = !process.env.COMPILE_ELECTRON;
import * as path from 'path';

// defined at compile-time via webpack.DefinePlugin
declare var COMPILE_ELECTRON: boolean;

const isWeb = !COMPILE_ELECTRON;
const isDevelopment = process.env.NODE_ENV !== 'production';

// variable gets created by electron-webpack
// points to the `static` resources directory
declare var __static;
// HACK(theis): fix __static pointing to the absolute path of the directory
// on the webpack-dev-server
export let static_correct;
if (isWeb) {
    static_correct = path.join(__dirname, 'static');
}
else {
    if (isDevelopment) {
        static_correct = '';  // static/ directory is being served on the WDS port
    }
    else {
        static_correct = __static;
    }
}
