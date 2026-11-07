import { REQUIRED_SERVICE_KEY } from '../auth/decorators/required-service.decorator';
import { RolePermissionGuard } from '../auth/guards/role-permission.guard';
import { PushNotificationsController } from './push-notifications.controller';

describe('PushNotificationsController (HU-37)', () => {
  it('protege todo el controlador con RolePermissionGuard', () => {
    expect(
      Reflect.getMetadata('__guards__', PushNotificationsController),
    ).toContain(RolePermissionGuard);
  });

  it.each([
    ['getPublicKey', 'ManageOwnPushSubscription'],
    ['getStatus', 'ManageOwnPushSubscription'],
    ['subscribe', 'ManageOwnPushSubscription'],
    ['unsubscribe', 'ManageOwnPushSubscription'],
    ['sendNotice', 'SendPushNotice'],
    ['sendArrivalReminder', 'SendPushNotice'],
    ['sendPendingEvaluations', 'SendPushNotice'],
  ])('%s exige el servicio %s', (handler, service) => {
    const method = (
      PushNotificationsController.prototype as unknown as Record<string, object>
    )[handler];
    expect(Reflect.getMetadata(REQUIRED_SERVICE_KEY, method)).toBe(service);
  });

  it('las rutas propias usan el id de la sesión, no uno que venga en la petición', async () => {
    const subscriptions = {
      subscribe: jest.fn(),
      unsubscribe: jest.fn(),
      getStatus: jest.fn(),
    };
    const controller = new PushNotificationsController(
      subscriptions as any,
      {} as any,
    );

    await controller.unsubscribe('sesion', { endpoint: 'e' });

    expect(subscriptions.unsubscribe).toHaveBeenCalledWith('sesion', 'e');
  });
});
