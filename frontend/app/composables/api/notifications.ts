import type { Notification } from '~~/types'

export const useNotifications = () => useApi<Notification[]>('/notifications')
