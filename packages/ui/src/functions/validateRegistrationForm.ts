/**
 * 註冊表單的原始輸入資料介面
 */
export interface RegistrationInput {
  /** 使用者名稱，預期為 3 到 20 個字元的英數字 */
  username: string;
  /** 使用者的電子郵件地址，需符合 Email 格式 */
  email: string;
  /** 使用者設定的密碼，需包含大小寫字母與數字 */
  password: string;
  /** 再次輸入的確認密碼，用來核對是否與密碼一致 */
  confirmPassword: string;
  /** 使用者的年齡，必須大於或等於 18 歲 */
  age: number;
  /** 使用者是否已勾選同意服務條款與隱私權政策 */
  acceptTerms: boolean;
}

/**
 * 表單欄位錯誤訊息的結構物件
 * 鍵值對應 RegistrationInput 的欄位，若該欄位無錯誤則為 undefined
 */
export interface ValidationErrorMessages {
  username?: string;
  email?: string;
  password?: string;
  confirmPassword?: string;
  age?: string;
  acceptTerms?: string;
}

/**
 * 表單驗證完成後的回傳結果介面
 */
export interface ValidationResult {
  /** 整份表單是否完全合法且通過驗證 */
  isValid: boolean;
  /** 包含所有未通過驗證欄位的錯誤訊息物件 */
  errors: ValidationErrorMessages;
  /** 針對密碼強度的評級強度 */
  passwordStrength: 'weak' | 'medium' | 'strong';
  /** 驗證完成的時間戳記（ISO 8601 格式） */
  validatedAt: string;
}

/**
 * 驗證使用者註冊表單的各項欄位是否符合業務邏輯規則。
 * * 驗證規則包含：
 * 1. 所有欄位必填
 * 2. Email 格式驗證
 * 3. 密碼與確認密碼必須相同
 * 4. 年齡必須滿 18 歲
 * 5. 必須勾選同意條款
 * * @param input 來自註冊表單的原始使用者輸入物件
 * @returns 回傳一個包含驗證狀態、各欄位錯誤訊息與密碼強度的結果物件
 */
export function validateRegistrationForm(input: RegistrationInput): ValidationResult {
  // 僅定義型別與介面，不進行實際驗證邏輯（保留 input 供之後實作使用）
  void input;
  return {
    isValid: false,
    errors: {},
    passwordStrength: 'weak',
    validatedAt: ''
  };
}