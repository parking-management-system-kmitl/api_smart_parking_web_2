export class LicensePlateSearchDto {
    licensePlate: string;
    page?: number;
    limit?: number;
    sortBy?: 'entry_time' | 'exit_time';
    sortOrder?: 'ASC' | 'DESC';
  }