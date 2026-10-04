import { ENCOUNTERS } from "@/data/encounters"
import { CONSULTATION_INVOICES, SERVICES_INVOICES } from "@/data/billing"
import { LAB_ORDERS } from "@/data/lab"
import { IMAGING_ORDERS } from "@/data/imaging"
import { DISPENSE_RECORDS } from "@/data/pharmacy"

export interface BillBreakdown {
  consultation: number
  consultationReceived: number
  services: number
  servicesReceived: number
  lab: number
  imaging: number
  medicine: number
  total: number
  received: number
  balance: number
}

function sum<T>(items: T[], pick: (item: T) => number): number {
  return items.reduce((s, item) => s + pick(item), 0)
}

/** Consolidated bill for one OPD/IPD encounter — aggregates consultation, services, lab, imaging and pharmacy charges linked to it. */
export function encounterBillBreakdown(encounterId: number): BillBreakdown {
  const encounter = ENCOUNTERS.find((e) => e.id === encounterId)
  const linkedConsultInvoices = CONSULTATION_INVOICES.filter((c) => c.encounterId === encounterId)
  const consultation = linkedConsultInvoices.length > 0 ? sum(linkedConsultInvoices, (c) => c.netTotal) : encounter?.netTotal ?? 0
  const consultationReceived = linkedConsultInvoices.length > 0
    ? sum(linkedConsultInvoices, (c) => c.amountReceived)
    : encounter?.amountReceived ?? 0

  const servicesInvoices = SERVICES_INVOICES.filter((s) => s.encounterId === encounterId)
  const services = sum(servicesInvoices, (s) => s.netTotal)
  const servicesReceived = sum(servicesInvoices, (s) => s.amountReceived)

  const labOrders = LAB_ORDERS.filter((o) => o.encounterId === encounterId)
  const lab = sum(labOrders, (o) => o.total)
  const labReceived = sum(labOrders.filter((o) => o.paymentStatus === "paid"), (o) => o.total)

  const imagingOrders = IMAGING_ORDERS.filter((o) => o.encounterId === encounterId)
  const imaging = sum(imagingOrders, (o) => o.total)

  const dispenses = DISPENSE_RECORDS.filter((d) => d.encounterId === encounterId)
  const medicine = sum(dispenses, (d) => d.netPayable)

  const total = consultation + services + lab + imaging + medicine
  const received = consultationReceived + servicesReceived + labReceived + imaging + medicine
  const balance = Math.max(0, total - received)

  return { consultation, consultationReceived, services, servicesReceived, lab, imaging, medicine, total, received, balance }
}

/** Consolidated bill across every encounter and standalone invoice for one patient. */
export function patientBillBreakdown(patientId: number): BillBreakdown {
  const encounterIds = ENCOUNTERS.filter((e) => e.patientId === patientId).map((e) => e.id)
  const perEncounter = encounterIds.map(encounterBillBreakdown)

  const standaloneConsult = CONSULTATION_INVOICES.filter((c) => c.patientId === patientId && c.encounterId === null)
  const standaloneServices = SERVICES_INVOICES.filter((s) => s.patientId === patientId && s.encounterId === null)
  const standaloneLab = LAB_ORDERS.filter((o) => o.patientId === patientId && o.encounterId === null)
  const standaloneImaging = IMAGING_ORDERS.filter((o) => o.patientId === patientId && o.encounterId === null)
  const standaloneMed = DISPENSE_RECORDS.filter((d) => d.patientId === patientId && d.encounterId === null)

  const base = perEncounter.reduce<BillBreakdown>(
    (acc, b) => ({
      consultation: acc.consultation + b.consultation,
      consultationReceived: acc.consultationReceived + b.consultationReceived,
      services: acc.services + b.services,
      servicesReceived: acc.servicesReceived + b.servicesReceived,
      lab: acc.lab + b.lab,
      imaging: acc.imaging + b.imaging,
      medicine: acc.medicine + b.medicine,
      total: acc.total + b.total,
      received: acc.received + b.received,
      balance: acc.balance + b.balance,
    }),
    { consultation: 0, consultationReceived: 0, services: 0, servicesReceived: 0, lab: 0, imaging: 0, medicine: 0, total: 0, received: 0, balance: 0 }
  )

  const extraConsult = sum(standaloneConsult, (c) => c.netTotal)
  const extraConsultReceived = sum(standaloneConsult, (c) => c.amountReceived)
  const extraServices = sum(standaloneServices, (s) => s.netTotal)
  const extraServicesReceived = sum(standaloneServices, (s) => s.amountReceived)
  const extraLab = sum(standaloneLab, (o) => o.total)
  const extraLabReceived = sum(standaloneLab.filter((o) => o.paymentStatus === "paid"), (o) => o.total)
  const extraImaging = sum(standaloneImaging, (o) => o.total)
  const extraMed = sum(standaloneMed, (d) => d.netPayable)

  const extraTotal = extraConsult + extraServices + extraLab + extraImaging + extraMed
  const extraReceived = extraConsultReceived + extraServicesReceived + extraLabReceived + extraImaging + extraMed

  return {
    consultation: base.consultation + extraConsult,
    consultationReceived: base.consultationReceived + extraConsultReceived,
    services: base.services + extraServices,
    servicesReceived: base.servicesReceived + extraServicesReceived,
    lab: base.lab + extraLab,
    imaging: base.imaging + extraImaging,
    medicine: base.medicine + extraMed,
    total: base.total + extraTotal,
    received: base.received + extraReceived,
    balance: Math.max(0, base.total + extraTotal - (base.received + extraReceived)),
  }
}
