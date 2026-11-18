import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('api', {
  findByBarcode: (code: string) =>
    ipcRenderer.invoke('product:findByBarcode', code) as Promise<PosProduct | undefined>,
})
