// ── Form validation helpers ─────────────────────────────────────────────
// Plain JS — no external dependencies. Each validator returns
// { valid: boolean, errors: { field: message } }.

const ALLOWED_CURRENCIES = ['EUR', 'USD', 'GBP', 'CHF', 'BRL', 'CLP', 'MXN']

const MAX_NAME_LENGTH = 500
const MAX_DESC_LENGTH = 2000

// ── Helpers ─────────────────────────────────────────────────────────────

function isPositiveNumber(value) {
  if (value === '' || value === null || value === undefined) return true // empty is OK (optional)
  const n = Number(value)
  return !isNaN(n) && n >= 0
}

function isStrictlyPositiveNumber(value) {
  if (value === '' || value === null || value === undefined) return true
  const n = Number(value)
  return !isNaN(n) && n > 0
}

function isValidEmail(email) {
  if (!email) return true
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
}

function isValidDate(dateStr) {
  if (!dateStr) return true
  const d = new Date(dateStr)
  return !isNaN(d.getTime())
}

function trimmedLength(value, max) {
  if (!value) return true
  return String(value).trim().length <= max
}

// ── Deal validation ─────────────────────────────────────────────────────

export function validateDeal(form) {
  const errors = {}

  // Required fields
  if (!form.bu) errors.bu = 'BU is required'
  if (!form.client || !String(form.client).trim()) errors.client = 'Client is required'
  if (!form.stage) errors.stage = 'Stage is required'

  // String lengths
  if (!trimmedLength(form.client, MAX_NAME_LENGTH))
    errors.client = `Client name must be under ${MAX_NAME_LENGTH} characters`
  if (!trimmedLength(form.description, MAX_DESC_LENGTH))
    errors.description = `Description must be under ${MAX_DESC_LENGTH} characters`
  if (!trimmedLength(form.end_customer, MAX_NAME_LENGTH))
    errors.end_customer = `End customer name must be under ${MAX_NAME_LENGTH} characters`

  // Numeric fields must be positive
  if (form.value_total !== '' && form.value_total !== undefined && !isPositiveNumber(form.value_total))
    errors.value_total = 'Value must be a positive number'
  if (form.vgt_cost !== '' && form.vgt_cost !== undefined && !isPositiveNumber(form.vgt_cost))
    errors.vgt_cost = 'VGT cost must be a positive number'
  if (form.distributor_price !== '' && form.distributor_price !== undefined && !isPositiveNumber(form.distributor_price))
    errors.distributor_price = 'Distributor price must be a positive number'
  if (form.end_customer_price !== '' && form.end_customer_price !== undefined && !isPositiveNumber(form.end_customer_price))
    errors.end_customer_price = 'End customer price must be a positive number'
  if (form.end_customer_value !== '' && form.end_customer_value !== undefined && !isPositiveNumber(form.end_customer_value))
    errors.end_customer_value = 'End customer value must be a positive number'
  if (form.list_price !== '' && form.list_price !== undefined && !isPositiveNumber(form.list_price))
    errors.list_price = 'List price must be a positive number'

  // Win probability must be 0-100
  if (form.win_probability !== '' && form.win_probability !== undefined && form.win_probability !== null) {
    const wp = Number(form.win_probability)
    if (isNaN(wp) || wp < 0 || wp > 100)
      errors.win_probability = 'Win probability must be between 0 and 100'
  }

  // GM % must be reasonable
  if (form.gm_pct !== '' && form.gm_pct !== undefined) {
    const gm = Number(form.gm_pct)
    if (isNaN(gm))
      errors.gm_pct = 'GM% must be a number'
  }

  // Currency
  if (form.currency && !ALLOWED_CURRENCIES.includes(form.currency))
    errors.currency = `Currency must be one of: ${ALLOWED_CURRENCIES.join(', ')}`

  // Exchange rate must be positive when set
  if (form.currency && form.currency !== 'EUR' && form.exchange_rate) {
    if (!isStrictlyPositiveNumber(form.exchange_rate))
      errors.exchange_rate = 'Exchange rate must be a positive number'
  }

  // Lost reason required if stage is Lost
  if (form.stage === 'Lost' && !form.lost_reason)
    errors.lost_reason = 'Please select a reason for losing this deal'

  // Contract period — end must be after start when both are set
  if (form.contract_start && !isValidDate(form.contract_start))
    errors.contract_start = 'Invalid contract start date'
  if (form.contract_end && !isValidDate(form.contract_end))
    errors.contract_end = 'Invalid contract end date'
  if (form.contract_start && form.contract_end &&
      isValidDate(form.contract_start) && isValidDate(form.contract_end)) {
    if (new Date(form.contract_end) <= new Date(form.contract_start))
      errors.contract_end = 'Contract end must be after start'
  }

  return { valid: Object.keys(errors).length === 0, errors }
}

// ── SLA / Contract validation ───────────────────────────────────────────

export function validateSLA(form) {
  const errors = {}

  // Required fields
  if (!form.bu) errors.bu = 'BU is required'
  if (!form.client || !String(form.client).trim()) errors.client = 'Client is required'

  // String lengths
  if (!trimmedLength(form.client, MAX_NAME_LENGTH))
    errors.client = `Client name must be under ${MAX_NAME_LENGTH} characters`
  if (!trimmedLength(form.description, MAX_DESC_LENGTH))
    errors.description = `Description must be under ${MAX_DESC_LENGTH} characters`

  // Numeric fields
  if (form.annual_value !== '' && form.annual_value !== undefined && !isPositiveNumber(form.annual_value))
    errors.annual_value = 'Annual value must be a positive number'
  if (form.price_per_study !== '' && form.price_per_study !== undefined && !isPositiveNumber(form.price_per_study))
    errors.price_per_study = 'Price per study must be a positive number'
  if (form.previous_value !== '' && form.previous_value !== undefined && !isPositiveNumber(form.previous_value))
    errors.previous_value = 'Previous value must be a positive number'
  if (form.renewal_target_pct !== '' && form.renewal_target_pct !== undefined) {
    const rtp = Number(form.renewal_target_pct)
    if (isNaN(rtp) || rtp < 0 || rtp > 100)
      errors.renewal_target_pct = 'Renewal target must be between 0% and 100%'
  }

  // Date validation
  if (form.start_date && !isValidDate(form.start_date))
    errors.start_date = 'Invalid start date'
  if (form.end_date && !isValidDate(form.end_date))
    errors.end_date = 'Invalid end date'
  if (form.start_date && form.end_date && isValidDate(form.start_date) && isValidDate(form.end_date)) {
    if (new Date(form.end_date) <= new Date(form.start_date))
      errors.end_date = 'End date must be after start date'
  }
  if (form.renewal_date && !isValidDate(form.renewal_date))
    errors.renewal_date = 'Invalid renewal date'
  if (form.invoice_date && !isValidDate(form.invoice_date))
    errors.invoice_date = 'Invalid invoice date'

  // Currency
  if (form.currency && !ALLOWED_CURRENCIES.includes(form.currency))
    errors.currency = `Currency must be one of: ${ALLOWED_CURRENCIES.join(', ')}`

  return { valid: Object.keys(errors).length === 0, errors }
}

// ── Task validation ─────────────────────────────────────────────────────

export function validateTask(form) {
  const errors = {}

  // Required
  if (!form.title || !String(form.title).trim()) errors.title = 'Title is required'

  // String lengths
  if (!trimmedLength(form.title, MAX_NAME_LENGTH))
    errors.title = `Title must be under ${MAX_NAME_LENGTH} characters`
  if (!trimmedLength(form.notes, MAX_DESC_LENGTH))
    errors.notes = `Notes must be under ${MAX_DESC_LENGTH} characters`

  // Date validation
  if (form.deadline && !isValidDate(form.deadline))
    errors.deadline = 'Invalid deadline date'

  return { valid: Object.keys(errors).length === 0, errors }
}

// ── Tender validation ───────────────────────────────────────────────────

export function validateTender(form) {
  const errors = {}

  // Required
  if (!form.title || !String(form.title).trim()) errors.title = 'Title is required'

  // String lengths
  if (!trimmedLength(form.title, MAX_NAME_LENGTH))
    errors.title = `Title must be under ${MAX_NAME_LENGTH} characters`
  if (!trimmedLength(form.reference, MAX_NAME_LENGTH))
    errors.reference = `Reference must be under ${MAX_NAME_LENGTH} characters`
  if (!trimmedLength(form.description, MAX_DESC_LENGTH))
    errors.description = `Description must be under ${MAX_DESC_LENGTH} characters`

  // Numeric
  if (form.estimated_value !== '' && form.estimated_value !== undefined && !isPositiveNumber(form.estimated_value))
    errors.estimated_value = 'Estimated value must be a positive number'

  // Currency
  if (form.currency && !ALLOWED_CURRENCIES.includes(form.currency))
    errors.currency = `Currency must be one of: ${ALLOWED_CURRENCIES.join(', ')}`

  // Date validation
  if (form.submission_deadline && !isValidDate(form.submission_deadline))
    errors.submission_deadline = 'Invalid submission deadline'
  if (form.decision_date && !isValidDate(form.decision_date))
    errors.decision_date = 'Invalid decision date'
  if (form.submission_deadline && form.decision_date &&
      isValidDate(form.submission_deadline) && isValidDate(form.decision_date)) {
    if (new Date(form.decision_date) < new Date(form.submission_deadline))
      errors.decision_date = 'Decision date should not be before submission deadline'
  }

  return { valid: Object.keys(errors).length === 0, errors }
}
