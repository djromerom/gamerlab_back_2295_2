import { registerDecorator, ValidationArguments, ValidationOptions } from 'class-validator';

/**
 * La fecha decorada no puede ser anterior a la de la propiedad indicada (M7). Si alguna de las
 * dos no viene (p. ej. un PATCH parcial), no valida: el servicio la combina con la guardada.
 */
export function IsNotBefore(property: string, validationOptions?: ValidationOptions) {
  return (object: object, propertyName: string) => {
    registerDecorator({
      name: 'isNotBefore',
      target: object.constructor,
      propertyName,
      constraints: [property],
      options: validationOptions,
      validator: {
        validate(value: unknown, args: ValidationArguments) {
          const [otherProperty] = args.constraints as [string];
          const other = (args.object as Record<string, unknown>)[otherProperty];
          if (!(value instanceof Date) || !(other instanceof Date)) return true;
          if (isNaN(value.getTime()) || isNaN(other.getTime())) return true;
          return value.getTime() >= other.getTime();
        },
      },
    });
  };
}
