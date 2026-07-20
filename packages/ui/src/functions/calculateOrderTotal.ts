/**
 * 購物車內單一商品項目的介面
 */
export interface OrderItem {
  /** 商品的唯一識別碼 */
  id: string;
  /** 商品的單價（以基准貨幣單位計，例如：元） */
  price: number;
  /** 購買的數量 */
  quantity: number;
  /** 適用於該商品的稅率（例如：0.05 代表 5% 營業稅） */
  taxRate: number;
  /** 是否適用商店的全局折扣活動 */
  isDiscountable: boolean;
}

/**
 * 結算訂單金額時所需的完整輸入參數
 */
export interface OrderCalculationInput {
  /** 購物車中的商品項目列表 */
  items: OrderItem[];
  /** 使用者輸入的優惠券/折扣碼（選填） */
  couponCode?: string;
  /** 物流配送方式 */
  shippingMethod: "standard" | "express" | "store_pickup";
  /** 使用者是否選擇使用點數折抵現金 */
  useRewardPoints?: boolean;
  /** 使用者帳戶現有的點數餘額 */
  availablePoints?: number;
}

/**
 * 訂單金額結算完成後輸出的詳細費用明細
 */
export interface OrderTotalOutput {
  /** 所有商品「單價 x 數量」的原始總和（未扣除任何折扣與稅金） */
  subtotal: number;
  /** 經過優惠券或點數折抵後，總共減少的金額 */
  totalDiscount: number;
  /** 根據各商品稅率計算出的總稅金 */
  totalTax: number;
  /** 根據配送方式計算出的物流運費 */
  shippingFee: number;
  /** 使用者最終需要支付的實際總金額 (Subtotal - Discount + Tax + ShippingFee) */
  grandTotal: number;
  /** 本次消費完成後，預計可額外獲得的會員紅利點數 */
  earnedPoints: number;
}

/**
 * 計算購物車訂單的各項費用明細，包含折扣、稅金、運費以及最終應付總額。
 * @param input 包含商品列表、折扣碼、配送方式等結算所需資訊的物件
 * @returns 回傳包含 subtotal、tax、shippingFee 與 grandTotal 的詳細金額明細物件
 * @throws {Error} 當傳入的商品數量小於等於 0，或點數扣抵數值異常時會拋出異常
 */
export function calculateOrderTotal(
  input: OrderCalculationInput,
): OrderTotalOutput {
  // 僅定義型別與介面，不進行實際操作（保留 input 供之後實作使用）
  void input;
  return {} as any;
}
