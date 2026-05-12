import {
  Injectable,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as bcrypt from 'bcrypt';
import { User, UserDocument } from './schemas/user.schema';
import { UpdateProfileDto } from './dto/update-profile.dto';

@Injectable()
export class UsersService {
  constructor(@InjectModel(User.name) private userModel: Model<UserDocument>) {}

  async create(email: string, password: string): Promise<UserDocument> {
    const exists = await this.userModel.findOne({ email });
    if (exists) throw new ConflictException('Email already in use');
    const hashed = await bcrypt.hash(password, 12);
    return new this.userModel({ email, password: hashed }).save();
  }

  async findByEmail(email: string): Promise<UserDocument | null> {
    return this.userModel.findOne({ email });
  }

  async findById(id: string): Promise<UserDocument> {
    const user = await this.userModel
      .findById(id)
      .select('-password -refreshToken');
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async updateProfile(
    id: string,
    dto: UpdateProfileDto,
  ): Promise<UserDocument> {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return this.userModel
      .findByIdAndUpdate(id, dto, { new: true })
      .select('-password -refreshToken');
  }

  async saveRefreshToken(id: string, token: string): Promise<void> {
    const hashed = await bcrypt.hash(token, 10);
    await this.userModel.findByIdAndUpdate(id, { refreshToken: hashed });
  }

  async clearRefreshToken(id: string): Promise<void> {
    await this.userModel.findByIdAndUpdate(id, { refreshToken: null });
  }

  async validateRefreshToken(id: string, token: string): Promise<boolean> {
    const user = await this.userModel.findById(id).select('refreshToken');
    if (!user?.refreshToken) return false;
    return bcrypt.compare(token, user.refreshToken);
  }
}
