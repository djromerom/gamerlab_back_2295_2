import { Injectable } from '@nestjs/common';
import { CreateNrcDto } from './dto/create-nrc.dto';
import { UpdateNrcDto } from './dto/update-nrc.dto';

@Injectable()
export class NrcsService {
  create(createNrcDto: CreateNrcDto) {
    return 'This action adds a new nrc';
  }

  findAll() {
    return `This action returns all nrcs`;
  }

  findOne(id: number) {
    return `This action returns a #${id} nrc`;
  }

  update(id: number, updateNrcDto: UpdateNrcDto) {
    return `This action updates a #${id} nrc`;
  }

  remove(id: number) {
    return `This action removes a #${id} nrc`;
  }
}
