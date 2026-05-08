import { Test, TestingModule } from '@nestjs/testing';
import { JurorController } from './juror.controller';
import { JurorService } from './juror.service';
import { JurorAssignmentService } from './assignment-audit/juror-assignment.service';
import { AuthService } from '../auth/auth.service';

describe('JurorController', () => {
  let controller: JurorController;

  const jurorServiceMock = {};
  const jurorAssignmentServiceMock = {};
  const authServiceMock = {
    resendAuthEmailOfType: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [JurorController],
      providers: [
        {
          provide: JurorService,
          useValue: jurorServiceMock,
        },
        {
          provide: JurorAssignmentService,
          useValue: jurorAssignmentServiceMock,
        },
        {
          provide: AuthService,
          useValue: authServiceMock,
        },
      ],
    }).compile();

    controller = module.get<JurorController>(JurorController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});