import { CALENDLY_EVENT_TYPES } from "@/lib/calendly/constants"

export type ClosePipeline = "aplayers" | "bruno"

export const CLOSE_PIPELINES = {
  aplayers: {
    label: "APLAYERS",
    callBooked: "stat_GfxkjMmNcCXALYTCw4fKvamwZ4tkIXAxK7zZdX37zeL",
    noShow: "stat_ubYsIa1c48FuF9rVFPhjeKsnvOrEbXuLZi81UD4Ehm6",
  },
  bruno: {
    label: "BRUNO",
    callBooked: "stat_K5FoXlU24YZWnjP99jySG76bQSALcyfVrBZVkFZGEw6",
    noShow: "stat_LzMzbsNURx2658UUtLisAXqIZqukYJYgTrzsubacX1A",
  },
} as const

const ALL_STATUS_IDS = new Set<string>(
  Object.values(CLOSE_PIPELINES).flatMap((p) => [p.callBooked, p.noShow]),
)

export function pipelineStatusIds(pipeline: ClosePipeline): string[] {
  const p = CLOSE_PIPELINES[pipeline]
  return [p.callBooked, p.noShow]
}

export function isTrackedCloseStatus(statusId: string | null | undefined): boolean {
  if (!statusId) return false
  return ALL_STATUS_IDS.has(statusId)
}

export function resolveClosePipeline(eventTypeUri: string | null | undefined): ClosePipeline {
  if (eventTypeUri === CALENDLY_EVENT_TYPES.BRUNO) return "bruno"
  return "aplayers"
}

export function closeStatusToPipeline(statusId: string): ClosePipeline | null {
  for (const [key, pipeline] of Object.entries(CLOSE_PIPELINES) as [
    ClosePipeline,
    (typeof CLOSE_PIPELINES)[ClosePipeline],
  ][]) {
    if (statusId === pipeline.callBooked || statusId === pipeline.noShow) return key
  }
  return null
}

export function isCallBookedStatus(statusId: string, pipeline: ClosePipeline): boolean {
  return statusId === CLOSE_PIPELINES[pipeline].callBooked
}

export function isNoShowStatus(statusId: string, pipeline: ClosePipeline): boolean {
  return statusId === CLOSE_PIPELINES[pipeline].noShow
}
