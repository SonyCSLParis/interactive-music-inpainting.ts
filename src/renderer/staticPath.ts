import * as path from 'path'

// defined at compile-time via webpack.DefinePlugin
declare let COMPILE_ELECTRON: boolean

const IS_WEB = !COMPILE_ELECTRON

// variable gets created by electron-webpack
// points to the `static` resources directory
declare let __static: string
// HACK(theis): fix __static pointing to the absolute path of the directory
// on the webpack-dev-server
let static_correct: string
if (IS_WEB) {
  static_correct = path.join(__dirname, 'static')
} else {
  const IS_DEVELOPMENT: boolean = process.env.NODE_ENV !== 'production'
  if (IS_DEVELOPMENT) {
    static_correct = '' // static/ directory is being served on the WDS port
  } else {
    static_correct = __static
  }
}

export function getPathToStaticFile(pathToFile: string): string {
  return path.join(static_correct, pathToFile).replace(/\s/gm, '%20')
}
