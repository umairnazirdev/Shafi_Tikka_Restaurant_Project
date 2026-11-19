/// <reference types="vite/client" />

interface Window {
  api: {
    getSettings(): Promise<Record<string, string>>
    setSettings(data: Record<string, string>): Promise<{ success: boolean }>
    backupDatabase(): Promise<{ success?: boolean; canceled?: boolean; path?: string }>
    restoreDatabase(): Promise<{ success?: boolean; canceled?: boolean; restartRequired?: boolean }>
    selectImage(): Promise<string | null>
    imageDataUrl(filePath: string): Promise<string | null>
    listCategories(): Promise<Category[]>
    createCategory(name: string): Promise<{ id: number }>
    updateCategory(id: number, name: string): Promise<{ success: boolean }>
    deleteCategory(id: number): Promise<{ success: boolean }>
    listWaiters(): Promise<Waiter[]>
    createWaiter(name: string): Promise<{ id: number }>
    listProducts(filters?: { search?: string; available_only?: boolean; category_id?: number }): Promise<Product[]>
    createProduct(data: unknown): Promise<{ id: number }>
    updateProduct(id: number, data: unknown): Promise<{ success: boolean }>
    deleteProduct(id: number): Promise<{ success?: boolean; softDeleted?: boolean }>
    createOrder(data: unknown): Promise<{ id: number; order_number: string; grand_total: number; change_amount: number }>
    listOrders(filters?: unknown): Promise<Order[]>
    getOrder(id: number): Promise<OrderDetail>
    cancelOrder(id: number): Promise<{ success: boolean }>
    printReceipt(orderId: number): Promise<{ success: boolean }>
    printInvoice(orderId: number): Promise<{ success: boolean }>
    getDashboardStats(): Promise<DashboardStats>
    getDailyReport(date?: string): Promise<{ summary: DailySummary; orders: Order[] }>
    listMaterials(search?: string): Promise<RawMaterial[]>
    createMaterial(data: unknown): Promise<{ id: number }>
    updateMaterial(id: number, data: unknown): Promise<{ success: boolean }>
    deleteMaterial(id: number): Promise<{ success: boolean }>
    adjustStock(data: unknown): Promise<{ success: boolean }>
    listStockMovements(materialId?: number): Promise<StockMovement[]>
    listRecipes(): Promise<Recipe[]>
    saveRecipe(data: unknown): Promise<{ id: number }>
    deleteRecipe(id: number): Promise<{ success: boolean }>
    listSuppliers(): Promise<Supplier[]>
    createSupplier(data: unknown): Promise<{ id: number }>
    listPurchases(filters?: unknown): Promise<Purchase[]>
    getPurchase(id: number): Promise<Purchase>
    createPurchase(data: unknown): Promise<{ id: number; purchase_number: string }>
    listExpenses(filters?: unknown): Promise<Expense[]>
    createExpense(data: unknown): Promise<{ id: number }>
    updateExpense(id: number, data: unknown): Promise<{ success: boolean }>
    deleteExpense(id: number): Promise<{ success: boolean }>
    previewClosing(date?: string, openingCash?: number): Promise<ClosingPreview>
    saveClosing(data: unknown): Promise<ClosingPreview & { success: boolean; cashDifference: number }>
    listClosings(): Promise<DailyClosing[]>
    getClosing(date: string): Promise<DailyClosing | null>
  }
}

interface Waiter {
  id: number
  name: string
}

interface Category {
  id: number
  name: string
  sort_order: number
}

interface Product {
  id: number
  name: string
  category_id: number | null
  category_name?: string
  selling_price: number
  purchase_cost: number
  image_path: string | null
  is_available: number
  sort_order: number
}

interface Order {
  id: number
  order_number: string
  customer_name: string | null
  customer_phone: string | null
  notes: string | null
  subtotal: number
  discount: number
  grand_total: number
  payment_method: string
  cash_received: number
  change_amount: number
  cogs: number
  status: string
  created_at: string
}

interface OrderItem {
  id: number
  product_id: number | null
  product_name: string
  quantity: number
  unit_price: number
  line_total: number
}

interface OrderDetail extends Order {
  items: OrderItem[]
  payments: Array<{ method: string; amount: number }>
}

interface RawMaterial {
  id: number
  name: string
  unit: string
  current_stock: number
  min_stock: number
  purchase_price: number
  notes: string | null
}

interface StockMovement {
  id: number
  raw_material_id: number
  material_name?: string
  movement_type: string
  quantity: number
  unit_price: number
  notes: string | null
  created_at: string
}

interface Recipe {
  id: number
  product_id: number
  product_name: string
  notes: string | null
  items: Array<{
    id: number
    raw_material_id: number
    material_name: string
    unit: string
    quantity: number
  }>
}

interface Supplier {
  id: number
  name: string
  phone: string | null
}

interface Purchase {
  id: number
  purchase_number: string
  supplier_name: string | null
  purchase_date: string
  total_amount: number
  notes: string | null
  items?: Array<{
    material_name: string
    unit: string
    quantity: number
    unit_price: number
    total_price: number
  }>
}

interface Expense {
  id: number
  title: string
  amount: number
  expense_date: string
  category: string
  description: string | null
}

interface DailySummary {
  date: string
  totalOrders: number
  productsSold: number
  totalSales: number
  cashSales: number
  cardSales: number
  otherSales: number
  totalDiscounts: number
  cancelledOrders: number
  totalPurchases: number
  totalExpenses: number
  cogs: number
  grossProfit: number
  netProfit: number
}

interface DashboardStats extends DailySummary {
  lowStock: RawMaterial[]
  lowStockCount: number
  materialCount: number
  recentTransactions: Order[]
  salesChart: Array<{ day: string; total: number; orders: number }>
}

interface ClosingPreview extends DailySummary {
  openingCash: number
  expectedCash: number
}

interface DailyClosing {
  id: number
  closing_date: string
  opening_cash: number
  cash_sales: number
  card_sales: number
  other_sales: number
  total_sales: number
  total_orders: number
  total_discounts: number
  total_purchases: number
  total_expenses: number
  cogs: number
  gross_profit: number
  net_profit: number
  expected_cash: number
  actual_closing_cash: number
  cash_difference: number
  notes: string | null
}
