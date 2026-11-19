import { contextBridge, ipcRenderer } from 'electron'

const api = {
  getSettings: () => ipcRenderer.invoke('settings:getAll'),
  setSettings: (data: Record<string, string>) => ipcRenderer.invoke('settings:setMany', data),
  backupDatabase: () => ipcRenderer.invoke('settings:backup'),
  restoreDatabase: () => ipcRenderer.invoke('settings:restore'),
  selectImage: () => ipcRenderer.invoke('app:selectImage'),
  imageDataUrl: (filePath: string) => ipcRenderer.invoke('app:imageDataUrl', filePath),

  listCategories: () => ipcRenderer.invoke('categories:list'),
  createCategory: (name: string) => ipcRenderer.invoke('categories:create', name),
  updateCategory: (id: number, name: string) => ipcRenderer.invoke('categories:update', id, name),
  deleteCategory: (id: number) => ipcRenderer.invoke('categories:delete', id),

  listProducts: (filters?: unknown) => ipcRenderer.invoke('products:list', filters),
  createProduct: (data: unknown) => ipcRenderer.invoke('products:create', data),
  updateProduct: (id: number, data: unknown) => ipcRenderer.invoke('products:update', id, data),
  deleteProduct: (id: number) => ipcRenderer.invoke('products:delete', id),

  createOrder: (data: unknown) => ipcRenderer.invoke('orders:create', data),
  listOrders: (filters?: unknown) => ipcRenderer.invoke('orders:list', filters),
  getOrder: (id: number) => ipcRenderer.invoke('orders:get', id),
  cancelOrder: (id: number) => ipcRenderer.invoke('orders:cancel', id),
  printReceipt: (orderId: number) => ipcRenderer.invoke('orders:printReceipt', orderId),

  getDashboardStats: () => ipcRenderer.invoke('dashboard:stats'),
  getDailyReport: (date?: string) => ipcRenderer.invoke('reports:daily', date),

  listMaterials: (search?: string) => ipcRenderer.invoke('materials:list', search),
  createMaterial: (data: unknown) => ipcRenderer.invoke('materials:create', data),
  updateMaterial: (id: number, data: unknown) => ipcRenderer.invoke('materials:update', id, data),
  deleteMaterial: (id: number) => ipcRenderer.invoke('materials:delete', id),
  adjustStock: (data: unknown) => ipcRenderer.invoke('materials:adjust', data),
  listStockMovements: (materialId?: number) => ipcRenderer.invoke('materials:movements', materialId),

  listRecipes: () => ipcRenderer.invoke('recipes:list'),
  saveRecipe: (data: unknown) => ipcRenderer.invoke('recipes:save', data),
  deleteRecipe: (id: number) => ipcRenderer.invoke('recipes:delete', id),

  listSuppliers: () => ipcRenderer.invoke('suppliers:list'),
  createSupplier: (data: unknown) => ipcRenderer.invoke('suppliers:create', data),
  listPurchases: (filters?: unknown) => ipcRenderer.invoke('purchases:list', filters),
  getPurchase: (id: number) => ipcRenderer.invoke('purchases:get', id),
  createPurchase: (data: unknown) => ipcRenderer.invoke('purchases:create', data),

  listExpenses: (filters?: unknown) => ipcRenderer.invoke('expenses:list', filters),
  createExpense: (data: unknown) => ipcRenderer.invoke('expenses:create', data),
  updateExpense: (id: number, data: unknown) => ipcRenderer.invoke('expenses:update', id, data),
  deleteExpense: (id: number) => ipcRenderer.invoke('expenses:delete', id),

  previewClosing: (date?: string, openingCash?: number) =>
    ipcRenderer.invoke('closing:preview', date, openingCash),
  saveClosing: (data: unknown) => ipcRenderer.invoke('closing:save', data),
  listClosings: () => ipcRenderer.invoke('closing:list'),
  getClosing: (date: string) => ipcRenderer.invoke('closing:get', date),
}

contextBridge.exposeInMainWorld('api', api)

export type ShafiApi = typeof api
