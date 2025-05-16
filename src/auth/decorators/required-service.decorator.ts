import { SetMetadata } from '@nestjs/common';

export const REQUIRED_SERVICE_KEY = 'requiredService';
/**
 * Decorator to specify the required service name for a route.
 * @param serviceName The unique name of the service from the 'servicio' table.
 */
export const RequiredService = (serviceName: string) =>
  SetMetadata(REQUIRED_SERVICE_KEY, serviceName);
