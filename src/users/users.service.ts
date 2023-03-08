import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { User } from './entities/user.entity';
import * as bcrypt from 'bcrypt';
import { validate as isUUID } from 'uuid';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly dataSource: DataSource,
  ) {}
  async create(createUserDto: CreateUserDto) {
    try {
      const { password, ...userData } = createUserDto;
      const user = this.userRepository.create({
        ...userData,
        password: bcrypt.hashSync(password, 10),
      });

      await this.userRepository.save(user);
      delete user.password;

      return { user };
    } catch (error) {
      console.log(error);
      this.handleDBErrors(error);
    }
  }

  findAll() {
    return `This action returns all users`;
  }

  async findOne(term: string) {
    let user: User;

    if (isUUID(term)) {
      user = await this.userRepository.findOneBy({ id: term });
    } else {
      const queryBuilder = this.userRepository.createQueryBuilder('user');
      user = await queryBuilder
        .where('UPPER(emal) =:email or name =:name', {
          email: term.toUpperCase(),
          name: term.toLowerCase(),
        })
        .getOne();
    }

    if (!user) throw new NotFoundException(`Product with ${term} not found`);

    return user;
  }

  async update(id: string, updateUserDto: UpdateUserDto) {
    const { ...toUpdate } = updateUserDto;

    const user = await this.userRepository.preload({
      id,
      ...toUpdate,
    });

    if (!user) throw new NotFoundException(`User with id: ${id} not found`);

    // Create query runner
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      await queryRunner.manager.save(user);

      await queryRunner.commitTransaction();
      await queryRunner.release();

      return this.findOne(id);
    } catch (error) {
      await queryRunner.rollbackTransaction();
      await queryRunner.release();
      this.handleDBErrors(error);
    }
  }

  async remove(id: string) {
    const user = await this.findOne(id);
    await this.userRepository.remove(user);
  }

  private handleDBErrors(error: any): never {
    if (error.code === '23505') {
      throw new BadRequestException(error.detail);
    } else {
      throw new InternalServerErrorException('Please check server logs');
    }
  }
}
