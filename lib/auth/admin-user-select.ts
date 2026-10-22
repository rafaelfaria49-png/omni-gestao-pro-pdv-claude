export const adminUserSelect = {
  id: true, name: true, email: true, role: true, lojaId: true, active: true,
  accessScope: true, mustChangePassword: true, createdAt: true, updatedAt: true,
  adminUserStores: { select: { storeId: true } },
} as const
