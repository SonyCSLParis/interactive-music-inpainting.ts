// Modules to control application life
import {app, ipcMain} from 'electron'
app.commandLine.appendSwitch('disable-pinch');
import * as log from 'loglevel'
import path from 'path';
import { outputFile } from 'fs-extra';

import * as WindowManager from './windowManager'
import LinkServer from './ableton_link/linkServer'

const isDevelopment = process.env.NODE_ENV !== 'production'

if (isDevelopment) { log.setLevel('debug'); }
else { log.setLevel('info'); }

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on('ready', WindowManager.createWindow)

// Quit when all windows are closed.
app.on('window-all-closed', function () {
  // On OS X it is common for applications and their menu bar
  // to stay active until the user quits explicitly with Cmd + Q
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', function () {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (!WindowManager.existsWindow()) {
    WindowManager.createWindow()
  }
})

ipcMain.on('disconnect', () => LinkServer.killLink());


ipcMain.handle('get-path', (event, fileName, appDirectory: 'documents' | 'temp') => {
  const storagePath = path.join(app.getPath(appDirectory), "NONOTO_generations", fileName);
  return storagePath
});

ipcMain.handle('save-file', (event, fileName, buffer) => {
  return outputFile(fileName, buffer)
})

ipcMain.on('ondragstart', (event, filePath, iconPath) => {
  event.sender.startDrag({
      file: filePath,
      icon: iconPath
  })
});
// })

LinkServer.attachListeners()

if (module.hot) {
}
