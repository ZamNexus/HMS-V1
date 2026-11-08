import { resolveDataSource, type DataSource } from "./dataSource"
import { demo } from "@hms/demo"
import { isSavedButUnreadableError } from "./errors"
import { httpAppointmentsService, httpDoctorScheduleService } from "./http/appointments"
import { httpBillingService } from "./http/billing"
import { httpImagingApiService, httpLabApiService } from "./http/diagnostics"
import { httpPharmacyApiService } from "./http/pharmacyApi"
import { httpAccountsApiService } from "./http/accountsApi"
import { httpReportsApiService } from "./http/reportsApi"
import { httpBedBoardService, httpVisitsService } from "./http/visits"
import { httpDoctorsService } from "./http/doctors"
import { httpEncountersService, httpWardsService } from "./http/encounters"
import { httpLabOrdersService } from "./http/lab"
import { httpEcgUltrasoundTestsService } from "./http/imagingTests"
import { httpLabTestsService } from "./http/labTests"
import { httpImagingOrdersService } from "./http/imaging"
import { httpPatientsService } from "./http/patients"
import {
  httpBankTransactionsService, httpConsultationInvoicesService, httpExpensesService, httpPaymentsService,
  httpReceiptsService, httpServicesInvoicesService,
} from "./http/finance"
import { httpReportsService } from "./http/reports"
import { httpServiceCatalogService } from "./http/serviceCatalog"
import { httpDashboardService, httpStatisticsService } from "./http/dashboard"
import { httpBillSummaryService, httpNotificationsService, httpServiceUsageService } from "./http/crossModule"
import { httpDispensingService, httpMedicinesService } from "./http/pharmacy"
import { httpGuardianRelationsService, httpOrganisationsService } from "./http/reference"
import { httpSettingsService } from "./http/settings"
import { httpWardAdminService } from "./http/wardsAdmin"
import { httpUserAdminService } from "./http/usersAdmin"
import { httpIcdService } from "./http/icd"
import { httpItemHistoryService } from "./http/itemHistory"
import { httpExpenseCategoriesService } from "./http/expenseCategories"
import { httpBankAccountsService } from "./http/bankAccounts"
import { httpRolesService } from "./http/roles"
import { httpUsersService } from "./http/users"
import { invalidateFamily } from "@/lib/query/invalidate"
import { isModuleDisabled, writeOutcomeUnknown } from "./createOutcome"
import { invalidateShared } from "./reference/cache"
import type {
  BillSummaryService, DashboardService, ItemHistoryService, NotificationsService, StatisticsService, ReportsService, ServiceCatalogService, ServiceUsageService,
  BankAccountsService, BankTransactionsService, ConsultationInvoicesService, ExpenseCategoriesService, ExpensesService, PaymentsService, ReceiptsService, ServicesInvoicesService,
  DispensingService, DoctorsService, EcgUltrasoundTestsService, EncountersService, GuardianRelationsService, ImagingOrdersService, LabOrdersService, LabTestsService, MedicinesService, OrganisationsService,
  PatientsService, RolesService, UsersService, WardsService, WardAdminService, UserAdminService, IcdService, AppointmentsService, DoctorScheduleService, VisitsService, BedBoardService, BillingService, LabApiService, ImagingApiService, PharmacyApiService, ReportsApiService, AccountsApiService,
} from "./types"

/**
 * Where the Users / Roles / Doctors / Patients screens (and shared reference data) get their data
 * (see ./dataSource.ts):
 *   "mock" — in-memory demo data from src/data. Not real hospital data.
 *   "api"  — the real backend through the shared API client.
 * Set NEXT_PUBLIC_HMS_DATA_SOURCE explicitly; production builds default to "api".
 * See docs/FRONTEND_BACKEND_INTEGRATION_HANDOFF.md.
 */
export const dataSource: DataSource = resolveDataSource(process.env.NEXT_PUBLIC_HMS_DATA_SOURCE, process.env.NODE_ENV)

const useApi = dataSource === "api"

/**
 * How long a settled reference-data result is reused. 0 in mock mode: unmigrated screens still mutate the
 * demo arrays directly, so a cache could show stale rows. Mutations made through the services below also
 * invalidate the cache, which is what keeps API mode fresh.
 */
export const REFERENCE_TTL_MS = useApi ? 30_000 : 0

/** Drops cached data of a family: the React Query entries (what the hooks read) and the legacy loadShared entries (kept only for the module tests). */
function invalidateAll(key: string): void {
  invalidateShared(key)
  void invalidateFamily(key)
}

/** Wraps a service so a successful mutation drops cached reference data under `key`. */
export function invalidatingService<S extends object>(service: S, key: string, mutations: readonly (keyof S)[]): S {
  const wrapped = { ...service }
  for (const name of mutations) {
    const original = service[name] as unknown as (...args: unknown[]) => Promise<unknown>
    wrapped[name] = (async (...args: unknown[]) => {
      let result: unknown
      try {
        result = await original.apply(service, args)
      } catch (err) {
        // The server accepted the change but its answer was unreadable, or no answer arrived at all (it may have saved it): the cached lists
        // may be stale, and the screen tells the user to "check the list", so that list must be fresh.
        if (isSavedButUnreadableError(err) || writeOutcomeUnknown(err)) invalidateAll(key)
        // 422 MODULE_DISABLED: a department was switched off after this session loaded the settings (handoff 8.1). Read the switches again so the
        // menus and screens follow, instead of leaving the user on a screen whose every save is refused.
        if (isModuleDisabled(err)) void invalidateFamily("settings")
        throw err
      }
      invalidateAll(key)
      return result
    }) as unknown as S[typeof name]
  }
  return wrapped
}

export const usersService: UsersService = useApi ? httpUsersService : demo.services.mockUsersService
export const rolesService: RolesService = useApi ? httpRolesService : demo.services.mockRolesService
export const doctorsService: DoctorsService = invalidatingService(useApi ? httpDoctorsService : demo.services.mockDoctorsService, "doctors", ["create", "update"])
export const patientsService: PatientsService = invalidatingService(useApi ? httpPatientsService : demo.services.mockPatientsService, "patient", ["create", "update", "remove", "restore", "recordDeath", "revokeDeath"])
export const encountersService: EncountersService = invalidatingService(
  invalidatingService(
    invalidatingService(useApi ? httpEncountersService : demo.services.mockEncountersService, "encounter", ["create", "discharge"]),
    "wards",
    ["create", "discharge"]
  ),
  "wardsAdmin", // the admin ward list shows occupancy, which an admission or a discharge changes
  ["create", "discharge"]
)
export const wardsService: WardsService = useApi ? httpWardsService : demo.services.mockWardsService

// Appointments and doctor schedules (Phase 6). The demo has none (every call says so). A booking, a change or a new schedule moves the slot grid and the
// appointment lists, so each write refreshes the "slots" and "appointments" families (a new schedule also refreshes "schedule").
export const appointmentsService: AppointmentsService = invalidatingService(
  invalidatingService(useApi ? httpAppointmentsService : demo.services.mockAppointmentsService, "appointments", ["book", "reschedule", "confirm", "cancel", "noShow"]),
  "slots",
  ["book", "reschedule", "cancel", "noShow"]
)
// Encounters ("visits") and the bed board (Phase 7). One write can touch several lists: a check-in completes an appointment, an admission or a discharge changes the bed board
// and the patient's admitted flag, a cancelled or reopened visit frees or takes a bed. Each family below is refreshed after the writes that change it.
const VISIT_WRITES = ["checkInOpd", "admit", "correctCheckIn", "recordVitals", "saveClinicalRecord", "close", "addNote", "transfer", "discharge", "cancel", "reopen", "archive", "restore"] as const
// An admission, discharge or cancellation also changes the ward occupancy shown in Master Data, and a check-in, discharge or cancellation changes the visit's bill (room and consultation charges).
const VISIT_WARD_WRITES = ["admit", "transfer", "discharge", "cancel", "reopen", "archive", "restore"] as const
const VISIT_BILL_WRITES = ["checkInOpd", "admit", "transfer", "discharge", "cancel", "reopen", "archive", "restore"] as const
const visitsBase: VisitsService = invalidatingService(
  invalidatingService(
    invalidatingService(
      invalidatingService(
        invalidatingService(useApi ? httpVisitsService : demo.services.mockVisitsService, "visits", VISIT_WRITES),
        "bedBoard", ["admit", "transfer", "discharge", "cancel", "reopen", "archive", "restore"]
      ),
      "patient", ["checkInOpd", "admit", "discharge", "cancel", "reopen", "archive", "restore"]
    ),
    "appointments", ["checkInOpd", "cancel", "reopen", "archive", "restore"]
  ),
  "slots", ["checkInOpd", "cancel", "reopen", "archive", "restore"]
)
export const visitsService: VisitsService = (["invoice", "invoices", "account", "charges"] as const).reduce<VisitsService>(
  (service, family) => invalidatingService(service, family, VISIT_BILL_WRITES),
  invalidatingService(visitsBase, "wardsAdmin", VISIT_WARD_WRITES)
)
const BILLING_WRITES = ["createInvoice", "addCharges", "discountInvoice", "voidInvoice", "voidCharge", "recordPayment", "recordAdvance", "applyCredit", "refund", "creditNote"] as const
// After any billing write the bill, the hub lists, the accounts and both registers are read again (the server owns every figure).
export const billingService: BillingService = (["invoice", "invoices", "account", "payments", "charges"] as const).reduce<BillingService>(
  (service, family) => invalidatingService(service, family, BILLING_WRITES),
  useApi ? httpBillingService : demo.services.mockBillingService
)
// Placing, cancelling and adding tests post or void charges: the bill, the hub lists, the accounts and the registers are read again with the order lists.
const LAB_WRITES = ["create", "addTests", "cancelTest", "collect", "reject", "enterResult", "verify", "amend", "writeRemarks", "deliver", "archive", "restore"] as const
export const labApiService: LabApiService = (["labApi", "invoice", "invoices", "account", "charges"] as const).reduce<LabApiService>(
  (service, family) => invalidatingService(service, family, LAB_WRITES),
  useApi ? httpLabApiService : demo.services.mockLabApiService
)
// Every pharmacy write refreshes the pharmacy lists; a dispense or a return also charges or credits, so the bill, the hub lists, the accounts and the registers are read again.
const PHARMACY_WRITES = ["createMedicine", "updateMedicine", "setMedicineActive", "receiveStock", "writeOff", "adjust", "dispense", "returnLine"] as const
const PHARMACY_BILLING_WRITES = ["dispense", "returnLine"] as const
export const pharmacyApiService: PharmacyApiService = (["invoice", "invoices", "account", "charges", "payments"] as const).reduce<PharmacyApiService>(
  (service, family) => invalidatingService(service, family, PHARMACY_BILLING_WRITES),
  invalidatingService(useApi ? httpPharmacyApiService : demo.services.mockPharmacyApiService, "pharmacyApi", PHARMACY_WRITES)
)
// Reports only read: nothing here changes data, so there is nothing to refresh after a write.
export const reportsApiService: ReportsApiService = useApi ? httpReportsApiService : demo.services.mockReportsApiService
// Expenses, bank entries and the cash drawer (handoff 8.10): any write refreshes every accounts list (a bank-paid expense also posts a bank entry; a void reverses it).
const ACCOUNTS_WRITES = ["createExpense", "updateExpense", "voidExpense", "createBankTransaction", "voidBankTransaction", "setDrawerOpening"] as const
export const accountsApiService: AccountsApiService = invalidatingService(useApi ? httpAccountsApiService : demo.services.mockAccountsApiService, "accountsApi", ACCOUNTS_WRITES)
const IMAGING_WRITES = ["create", "addTests", "cancelTest", "perform", "writeReport", "sign", "amend", "deliver", "archive", "restore"] as const
export const imagingApiService: ImagingApiService = (["imagingApi", "invoice", "invoices", "account", "charges"] as const).reduce<ImagingApiService>(
  (service, family) => invalidatingService(service, family, IMAGING_WRITES),
  useApi ? httpImagingApiService : demo.services.mockImagingApiService
)
export const bedBoardService: BedBoardService = invalidatingService(
  invalidatingService(useApi ? httpBedBoardService : demo.services.mockBedBoardService, "bedBoard", ["setMaintenance"]),
  "wardsAdmin", ["setMaintenance"]
)
export const doctorScheduleService: DoctorScheduleService = invalidatingService(
  invalidatingService(invalidatingService(useApi ? httpDoctorScheduleService : demo.services.mockDoctorScheduleService, "schedule", ["set"]), "slots", ["set"]),
  "appointments",
  ["set"] // appointments the new hours no longer cover come back with outsideSchedule: true
)
export const labTestsService: LabTestsService = invalidatingService(useApi ? httpLabTestsService : demo.services.mockLabTestsService, "labTests", ["create", "update", "patch", "setActive"])
export const ecgUltrasoundTestsService: EcgUltrasoundTestsService = invalidatingService(
  useApi ? httpEcgUltrasoundTestsService : demo.services.mockEcgUltrasoundTestsService, "ecgUltrasound", ["create", "update", "patch", "setActive"]
)
export const labOrdersService: LabOrdersService = invalidatingService(
  useApi ? httpLabOrdersService : demo.services.mockLabOrdersService, "labOrder", ["create", "transition", "enterResults"]
)
export const imagingOrdersService: ImagingOrdersService = invalidatingService(
  useApi ? httpImagingOrdersService : demo.services.mockImagingOrdersService, "imagingOrder", ["create", "transition", "enterReport"]
)
// Dispensing consumes stock, so a successful dispense also drops the cached medicines.
export const medicinesService: MedicinesService = invalidatingService(
  useApi ? httpMedicinesService : demo.services.mockMedicinesService, "medicines", ["create", "update", "adjustStock"]
)
export const dispensingService: DispensingService = invalidatingService(useApi ? httpDispensingService : demo.services.mockDispensingService, "medicines", ["create"])
// Billing, T6 Expenses and T7 Bank. In API mode every operation is CONTRACT REQUIRED (all endpoint keys null), so these adapters
// throw NotConnectedError before any request. Mutations drop the cached lookups they change.
export const consultationInvoicesService: ConsultationInvoicesService = useApi ? httpConsultationInvoicesService : demo.services.mockConsultationInvoicesService
export const servicesInvoicesService: ServicesInvoicesService = useApi ? httpServicesInvoicesService : demo.services.mockServicesInvoicesService
export const paymentsService: PaymentsService = useApi ? httpPaymentsService : demo.services.mockPaymentsService
export const receiptsService: ReceiptsService = useApi ? httpReceiptsService : demo.services.mockReceiptsService
export const expenseCategoriesService: ExpenseCategoriesService = invalidatingService(
  useApi ? httpExpenseCategoriesService : demo.services.mockExpenseCategoriesService, "expenseCategories", ["create", "update", "remove", "setActive"]
)
export const expensesService: ExpensesService = useApi ? httpExpensesService : demo.services.mockExpensesService
export const bankAccountsService: BankAccountsService = invalidatingService(
  useApi ? httpBankAccountsService : demo.services.mockBankAccountsService, "bankAccounts", ["create", "update", "patch", "setActive"]
)
export const bankTransactionsService: BankTransactionsService = useApi ? httpBankTransactionsService : demo.services.mockBankTransactionsService
// Reports (T8 / T9) and the read-only services catalogue for the Lists report. In API mode every operation is CONTRACT REQUIRED
// (all endpoint keys null), so these adapters throw NotConnectedError before any request. Nothing is cached: a report is re-run on demand.
export const reportsService: ReportsService = useApi ? httpReportsService : demo.services.mockReportsService
export const serviceCatalogService: ServiceCatalogService = invalidatingService(useApi ? httpServiceCatalogService : demo.services.mockServiceCatalogService, "services", ["create", "update", "patch", "setActive"])
// Dashboard (T10) and Financial Statistics (T11). In API mode every operation is CONTRACT REQUIRED (all endpoint keys null), so these
// adapters throw NotConnectedError before any request. Nothing is cached: a figure is fetched on demand.
export const dashboardService: DashboardService = useApi ? httpDashboardService : demo.services.mockDashboardService
export const statisticsService: StatisticsService = useApi ? httpStatisticsService : demo.services.mockStatisticsService
// Phase 4K. Item History (T12), the patient / encounter bill summary behind the balance panels, and the top-bar notifications. In API mode the
// first two are CONTRACT REQUIRED (endpoint keys null) and notifications have no contract at all, so these adapters throw NotConnectedError
// before any request. Nothing is cached.
export const itemHistoryService: ItemHistoryService = useApi ? httpItemHistoryService : demo.services.mockItemHistoryService
export const serviceUsageService: ServiceUsageService = useApi ? httpServiceUsageService : demo.services.mockServiceUsageService // demo-only invoice usage, NOT audit history
export const billSummaryService: BillSummaryService = useApi ? httpBillSummaryService : demo.services.mockBillSummaryService
export const notificationsService: NotificationsService = useApi ? httpNotificationsService : demo.services.mockNotificationsService
export const organisationsService:OrganisationsService = invalidatingService(useApi ? httpOrganisationsService : demo.services.mockOrganisationsService, "organisations", ["create", "update", "setActive"])
export const guardianRelationsService: GuardianRelationsService = invalidatingService(useApi ? httpGuardianRelationsService : demo.services.mockGuardianRelationsService, "guardianRelations", ["create", "update", "setActive"])
// Clinic Settings and module switches exist only in the API (the demo data has no equivalent): the screens mount only in API mode.
export const settingsService = httpSettingsService
// The ICD-10 list exists only in the API (the demo screens keep their own array).
export const icdService: IcdService = httpIcdService
// Staff users (admin view) exists only in the API; the demo Users screen keeps its own service.
export const userAdminService: UserAdminService = invalidatingService(
  invalidatingService(httpUserAdminService, "usersAdmin", ["create", "update", "updateDoctorProfile", "setActive"]),
  "doctors", // a staff change can add, rename or deactivate a doctor: the doctor pickers must re-read
  ["create", "update", "updateDoctorProfile", "setActive"]
)
// Wards and beds setup also exists only in the API (the demo Wards tab keeps its own arrays).
export const wardAdminService: WardAdminService = invalidatingService(httpWardAdminService, "wardsAdmin", ["create", "update", "setActive", "addBed", "renameBed", "setBedActive"])
export type { ModuleState, SettingsService } from "./http/settings"
export { FISCAL_MONTHS, SETTINGS_FIELDS, diffSettings, settingsFormOf, validateSettingsForm, type SettingsForm, type SettingsPatch } from "./settingsHelpers"

export { legacyPatientId, toLegacyPatient, findDuplicatePhone, pickerSearchTerm, PICKER_RESULT_LIMIT } from "./patientHelpers"
export { DISCHARGE_CONDITIONS, VISIT_LIMITS, VITALS_RANGES } from "./http/visits"
export { PM_LEVELS, PM_LIMITS, PM_MOVEMENT_TYPES, PM_PAY_MODES } from "./http/pharmacyApi"
export { RP_COLLECT_MODES, RP_MAX_DAYS, RP_SOURCE_TYPES, daysBetween, periodQuery } from "./http/reportsApi"
export { AC_ENTERABLE_KINDS, AC_LIMITS, AC_MODES, canonicalMoney } from "./http/accountsApi"
export { DX_FLAGS, DX_FULFILLMENTS, DX_LIMITS, DX_MODALITIES, DX_PRIORITIES, DX_SPECIMEN_TYPES, DX_STATUSES, DX_TEST_STATUSES } from "./http/diagnostics"
export { BILLING_LIMITS, BILLING_WRITE_LIMITS, CHARGE_SOURCE_TYPES, INVOICE_STATUSES, RECEIPT_MODES, RECEIPT_TYPES } from "./http/billing"
export { hospitalInstant, hospitalWallClock } from "./hospitalTime"
export { WEEK_DAYS, APPOINTMENT_ACTIONS, APPOINTMENT_STATUSES, APPOINTMENT_LIMITS, freeSlotTimes } from "./http/appointments"
export { ageParts, formatCnic, formatPatientAge, formatPhone, localToday } from "./patientFormat"
export { CNIC_RE, PATIENT_LIMITS, PHONE_RE, duplicateMatchesOf, patientHasChanges } from "./http/patientMap"
export { ENCOUNTER_FILTERS, encounterFilterOptions, encounterTotals, type EncounterFilter } from "./encounterHelpers"
export { LAB_FILTERS, flagFor, isLegalLabTransition, labFilterStatus, labLineTotal, labOrderTotals, type LabFilter, type LabLineSettings } from "./labHelpers"
export { IMAGING_CATEGORIES, IMAGING_FILTERS, imagingFilterStatus, isImagingTest, isLegalImagingTransition, type ImagingFilter } from "./imagingHelpers"
export {
  INVENTORY_FILTERS, NEAR_EXPIRY_DAYS, daysToExpiry, dispenseTotals, findStockShortfalls, inventorySummary, matchesInventoryFilter, medicineStatus, planDispense,
  type DispenseRowInput, type InventoryFilter, type MedicineStatusLabel, type StockShortfall,
} from "./pharmacyHelpers"
export { PHARMACY_OPERATION_LABELS, pharmacyContractStatus, type PharmacyContract, type PharmacyOperation } from "./pharmacyContract"
export { CROSS_MODULE_OPERATION_LABELS, crossModuleContractStatus, type CrossModuleContract, type CrossModuleOperation } from "./crossModuleContract"
export { DASHBOARD_OPERATION_LABELS, dashboardContractStatus, type DashboardContract, type DashboardOperation } from "./dashboardContract"
export { REPORT_OPERATION_LABELS, reportsContractStatus, type ReportOperation, type ReportsContract } from "./reportsContract"
export { AGED_BUCKETS, AGE_BANDS, ageBandOf, agedBucketOf, isCreditMode } from "./reportHelpers"
export { FINANCE_OPERATION_LABELS, financeContractStatus, type FinanceContract, type FinanceOperation } from "./financeContract"
export {
  applyDiscount, bankStatementRows, consultationTotals, expenseTotalsFor, invoiceTotals, paymentStatusFor, serviceLineAmount, servicesTotals, type InvoiceTotals,
} from "./financeHelpers"
export {
  addMoney, compareMoney, formatMoneyString, moneySymbol, setMoneyCurrency, isMoneyString, isPositiveMoney, isZeroMoney, moneyFromInputNumber, moneyFromNumber, normalizeMoneyInput, ratioPercent, subMoney, sumMoney,
} from "./moneyMath"
export { buildLookup, type Lookup } from "./reference/lookup"
export { legacyNumericId, refKey, type RefId } from "./reference/refId"
export { errorSummary, isNotConnectedError, isSavedButUnreadableError, NotConnectedError, SavedButUnreadableError } from "./errors"
export { classifyCreateError, type CreateFailure } from "./createOutcome"
export { DEFAULT_PAGE_SIZE, activeSuffix, viewState, type ViewState } from "./listing"
export { validateDoctorForm, validateUserForm } from "./formValidation"
export type * from "./types"
