// THE DEMO SEAM. Everything the prototype fakes (the in-memory services of src/lib/services/mock and the sample records of src/data) is reachable only through this module,
// imported as "@hms/demo". A production build for the real API replaces this module with ./registry.stub.ts (next.config.ts: turbopack.resolveAlias), so none of the sample data is
// shipped to a user; `npm run check:build` proves it. Development and mock builds use this file as it is. Nothing here is a fallback: API mode never reads it.
//
// Rules: only src/lib/services/index.ts and the screens that already branch on dataSource === "mock" may read `demo`, and only on the mock side of that branch.
import { mockBillSummaryService, mockItemHistoryService, mockNotificationsService, mockServiceUsageService } from "../services/mock/crossModule"
import { mockDashboardService, mockStatisticsService } from "../services/mock/dashboard"
import { mockDoctorsService } from "../services/mock/doctors"
import { mockAppointmentsService, mockDoctorScheduleService } from "../services/mock/appointments"
import { mockBillingService } from "../services/mock/billing"
import { mockImagingApiService, mockLabApiService } from "../services/mock/diagnostics"
import { mockPharmacyApiService } from "../services/mock/pharmacyApi"
import { mockAccountsApiService } from "../services/mock/accountsApi"
import { mockReportsApiService } from "../services/mock/reportsApi"
import { mockBedBoardService, mockVisitsService } from "../services/mock/visits"
import { mockEncountersService, mockWardsService } from "../services/mock/encounters"
import { mockImagingOrdersService } from "../services/mock/imaging"
import { mockEcgUltrasoundTestsService, mockLabOrdersService, mockLabTestsService } from "../services/mock/lab"
import { mockPatientsService } from "../services/mock/patients"
import { mockBankAccountsService, mockBankTransactionsService, mockConsultationInvoicesService, mockExpenseCategoriesService, mockExpensesService, mockPaymentsService, mockReceiptsService, mockServicesInvoicesService } from "../services/mock/finance"
import { mockDispensingService, mockMedicinesService } from "../services/mock/pharmacy"
import { mockReportsService, mockServiceCatalogService } from "../services/mock/reports"
import { mockGuardianRelationsService, mockOrganisationsService } from "../services/mock/reference"
import { mockRolesService, mockUsersService } from "../services/mock/users"
import { WARDS } from "@/data/wards"
import { CLINIC_SETTINGS } from "@/data/settings"
import { DISEASES } from "@/data/diseases"
import { ENCOUNTERS, encountersForPatient, nextTokenNo } from "@/data/encounters"
import { IMAGING_ORDERS, nextXrNo } from "@/data/imaging"
import { LAB_ORDERS, nextLabNo } from "@/data/lab"
import { DISPENSE_RECORDS, nextDispenseNo } from "@/data/pharmacy"
import { nextMrNo } from "@/data/patients"
import { CONSULTATION_INVOICES, SERVICES_INVOICES } from "@/data/billing"

export const demo = {
  services: {
    mockBillSummaryService, mockItemHistoryService, mockNotificationsService, mockServiceUsageService,
    mockDashboardService, mockStatisticsService, mockDoctorsService, mockAppointmentsService,
    mockDoctorScheduleService, mockBillingService, mockImagingApiService, mockLabApiService,
    mockPharmacyApiService, mockAccountsApiService, mockReportsApiService, mockBedBoardService,
    mockVisitsService, mockEncountersService, mockWardsService, mockImagingOrdersService,
    mockEcgUltrasoundTestsService, mockLabOrdersService, mockLabTestsService, mockPatientsService,
    mockBankAccountsService, mockBankTransactionsService, mockConsultationInvoicesService, mockExpenseCategoriesService,
    mockExpensesService, mockPaymentsService, mockReceiptsService, mockServicesInvoicesService,
    mockDispensingService, mockMedicinesService, mockReportsService, mockServiceCatalogService,
    mockGuardianRelationsService, mockOrganisationsService, mockRolesService, mockUsersService,
  },
  data: {
    WARDS,
    CLINIC_SETTINGS,
    DISEASES,
    ENCOUNTERS, encountersForPatient, nextTokenNo,
    IMAGING_ORDERS, nextXrNo,
    LAB_ORDERS, nextLabNo,
    DISPENSE_RECORDS, nextDispenseNo,
    nextMrNo,
    CONSULTATION_INVOICES, SERVICES_INVOICES,
  },
} as const

export type Demo = typeof demo
