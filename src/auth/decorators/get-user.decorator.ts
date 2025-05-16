import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AppUser } from '../supabase.strategy';

/**
 * Custom parameter decorator to extract the user object from the request.
 * The user object is attached to the request by the SupabaseStrategy
 * after successful authentication.
 *
 * @example
 * // Get the entire user object
 * async myHandler(@GetUser() user: AppUser) { ... }
 *
 * @example
 * // Get a specific property from the user object
 * async myHandler(@GetUser('id_usuario') userId: string) { ... }
 *
 * @param data - Optional key of the user object property to extract.
 * @param ctx - The execution context.
 */
export const GetUser = createParamDecorator(
  (
    data: keyof AppUser | undefined,
    ctx: ExecutionContext,
  ): AppUser | AppUser[keyof AppUser] | undefined => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user as AppUser;

    // If 'data' is provided then return that specific property.
    // Otherwise, we return the whole user object.
    return data ? user?.[data] : user;
  },
);
