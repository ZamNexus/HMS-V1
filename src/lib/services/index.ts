import { resolveDataSource, type DataSource } from "./dataSource"
import { httpDoctorsService } from "./http/doctors"
import { httpEncountersService, httpWardsService } from "./http/encounters"
import { httpEcgUltrasoundTestsService, httpLabOrdersService, httpLabTestsService } from "./http/lab"
import { httpImagingOrdersService } from "./http/imaging"
import { httpPatientsService } from "./http/patients"
import {
  httpBankAccountsService, httpBankTransactionsService, httpConsultationInvoicesService, httpExpenseCategoriesService, httpExpensesService, httpPaymentsService,
  httpReceiptsService, httpServicesInvoicesService,
} from "./http/finance"
import { httpReportsService, httpServiceCatalogService } from "./http/reports"
import { httpDashboardService, httpStatisticsService } from "./http/dashboard"
import { httpBillSummaryService, httpItemHistoryService, httpNotificationsService, httpServiceUsageService } from "./http/crossModule"
import { mockBillSummaryService, mockItemHistoryService, mockNotificationsService, mockServiceUsageService } from "./mock/crossModule"
import { mockDashboardService, mockStatisticsService } from "./mock/dashboard"
import { httpDispensingService, httpMedicinesService } from "./http/pharmacy"
import { httpGuardianRelationsService, httpOrganisationsService } from "./http/reference"
import { httpRolesService } from "./http/roles"
import { httpUsersService } from "./http/users"
import { mockDoctorsService } from "./mock/doctors"
import { mockEncountersService, mockWardsService } from "./mock/encounters"
import { mockImagingOrdersService } from "./mock/imaging"
import { mockEcgUltrasoundTestsService, mockLabOrdersService, mockLabTestsService } from "./mock/lab"
import { mockPatientsService } from "./mock/patients"
import {
  mockBankAccountsService, mockBankTransactionsService, mockConsultationInvoicesService, mockExpenseCategoriesService, mockExpensesService, mockPaymentsService,
  mockReceiptsService, mockServicesInvoicesService,
} from "./mock/finance"
import { mockDispensingService, mockMedicinesService } from "./mock/pharmacy"
import { mockReportsService, mockServiceCatalogService } from "./mock/reports"
import { mockGuardianRelationsService, mockOrganisationsService } from "./mock/reference"
import { mockRolesService, mockUsersService } from "./mock/users"
import { invalidateShared } from "./reference/cache"
import type {
  BillSummaryService, DashboardService, ItemHistoryService, NotificationsService, StatisticsService, ReportsService, ServiceCatalogService, ServiceUsageService,
  BankAccountsService, BankTransactionsService, ConsultationInvoicesService, ExpenseCategoriesService, ExpensesService, PaymentsService, ReceiptsService, ServicesInvoicesService,
  DispensingService, DoctorsService, EcgUltrasoundTestsService, EncountersService, GuardianRelationsService, ImagingOrdersService, LabOrdersService, LabTestsService, MedicinesService, OrganisationsService,
  PatientsService, RolesService, UsersService, WardsService,
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

/** Wraps a service so a successful mutation drops cached reference data under `key`. */
export function invalidatingService<S extends object>(service: S, key: string, mutations: readonly (keyof S)[]): S {
  const wrapped = { ...service }
  for (const name of mutations) {
    const original = service[name] as unknown as (...args: unknown[]) => Promise<unknown>
    wrapped[name] = (async (...args: unknown[]) => {
      const result = await original.apply(service, args)
      invalidateShared(key)
      return result
    }) as unknown as S[typeof name]
  }
  return wrapped
}

export const usersService: UsersService = useApi ? httpUsersService : mockUsersService
export const rolesService: RolesService = useApi ? httpRolesService : mockRolesService
export const doctorsService: DoctorsService = invalidatingService(useApi ? httpDoctorsService : mockDoctorsService, "doctors", ["create", "update"])
export const patientsService: PatientsService = invalidatingService(useApi ? httpPatientsService : mockPatientsService, "patient", ["create", "update", "remove"])
export const encountersService: EncountersService = invalidatingService(
  invalidatingService(useApi ? httpEncountersService : mockEncountersService, "encounter", ["create", "discharge"]),
  "wards",
  ["create", "discharge"]
)
export const wardsService: WardsService = useApi ? httpWardsService : mockWardsService
export const labTestsService: LabTestsService = invalidatingService(useApi ? httpLabTestsService : mockLabTestsService, "labTests", ["create", "update"])
export const ecgUltrasoundTestsService: EcgUltrasoundTestsService = invalidatingService(
  useApi ? httpEcgUltrasoundTestsService : mockEcgUltrasoundTestsService, "ecgUltrasound", ["create", "update"]
)
export const labOrdersService: LabOrdersService = invalidatingService(
  useApi ? httpLabOrdersService : mockLabOrdersService, "labOrder", ["create", "transition", "enterResults"]
)
export const imagingOrdersService: ImagingOrdersService = invalidatingService(
  useApi ? httpImagingOrdersService : mockImagingOrdersService, "imagingOrder", ["create", "transition", "enterReport"]
)
// Dispensing consumes stock, so a successful dispense also drops the cached medicines.
export const medicinesService: MedicinesService = invalidatingService(
  useApi ? httpMedicinesService : mockMedicinesService, "medicines", ["create", "update", "adjustStock"]
)
export const dispensingService: DispensingService = invalidatingService(useApi ? httpDispensingService : mockDispensingService, "medicines", ["create"])
// Billing, T6 Expenses and T7 Bank. In API mode every operation is CONTRACT REQUIRED (all endpoint keys null), so these adapters
// throw NotConnectedError before any request. Mutations drop the cached lookups they change.
export const consultationInvoicesService: ConsultationInvoicesService = useApi ? httpConsultationInvoicesService : mockConsultationInvoicesService
export const servicesInvoicesService: ServicesInvoicesService = useApi ? httpServicesInvoicesService : mockServicesInvoicesService
export const paymentsService: PaymentsService = useApi ? httpPaymentsService : mockPaymentsService
export const receiptsService: ReceiptsService = useApi ? httpReceiptsService : mockReceiptsService
export const expenseCategoriesService: ExpenseCategoriesService = invalidatingService(
  useApi ? httpExpenseCategoriesService : mockExpenseCategoriesService, "expenseCategories", ["create", "update", "remove"]
)
export const expensesService: ExpensesService = useApi ? httpExpensesService : mockExpensesService
export const bankAccountsService: BankAccountsService = invalidatingService(
  useApi ? httpBankAccountsService : mockBankAccountsService, "bankAccounts", ["create", "update"]
)
export const bankTransactionsService: BankTransactionsService = useApi ? httpBankTransactionsService : mockBankTransactionsService
// Reports (T8 / T9) and the read-only services catalogue for the Lists report. In API mode every operation is CONTRACT REQUIRED
// (all endpoint keys null), so these adapters throw NotConnectedError before any request. Nothing is cached: a report is re-run on demand.
export const reportsService: ReportsService = useApi ? httpReportsService : mockReportsService
export const serviceCatalogService: ServiceCatalogService = useApi ? httpServiceCatalogService : mockServiceCatalogService
// Dashboard (T10) and Financial Statistics (T11). In API mode every operation is CONTRACT REQUIRED (all endpoint keys null), so these
// adapters throw NotConnectedError before any request. Nothing is cached: a figure is fetched on demand.
export const dashboardService: DashboardService = useApi ? httpDashboardService : mockDashboardService
export const statisticsService: StatisticsService = useApi ? httpStatisticsService : mockStatisticsService
// Phase 4K. Item History (T12), the patient / encounter bill summary behind the balance panels, and the top-bar notifications. In API mode the
// first two are CONTRACT REQUIRED (endpoint keys null) and notifications have no contract at all, so these adapters throw NotConnectedError
// before any request. Nothing is cached.
export const itemHistoryService: ItemHistoryService = useApi ? httpItemHistoryService : mockItemHistoryService
export const serviceUsageService: ServiceUsageService = useApi ? httpServiceUsageService : mockServiceUsageService // demo-only invoice usage, NOT audit history
export const billSummaryService: BillSummaryService = useApi ? httpBillSummaryService : mockBillSummaryService
export const notificationsService: NotificationsService = useApi ? httpNotificationsService : mockNotificationsService
export const organisationsService:OrganisationsService = invalidatingService(useApi ? httpOrganisationsService : mockOrganisationsService, "organisations", ["create"])
export const guardianRelationsService: GuardianRelationsService = invalidatingService(useApi ? httpGuardianRelationsService : mockGuardianRelationsService, "guardianRelations", ["create"])

export { legacyPatientId, toLegacyPatient, findDuplicatePhone, pickerSearchTerm, PICKER_RESULT_LIMIT } from "./patientHelpers"
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
  addMoney, compareMoney, formatMoneyString, isMoneyString, isPositiveMoney, isZeroMoney, moneyFromInputNumber, moneyFromNumber, normalizeMoneyInput, ratioPercent, subMoney, sumMoney,
} from "./moneyMath"
export { buildLookup, type Lookup } from "./reference/lookup"
export { legacyNumericId, refKey, type RefId } from "./reference/refId"
export { errorSummary, isNotConnectedError, NotConnectedError } from "./errors"
export { DEFAULT_PAGE_SIZE, activeSuffix, viewState, type ViewState } from "./listing"
export { validateDoctorForm, validateUserForm } from "./formValidation"
export type * from "./types"
