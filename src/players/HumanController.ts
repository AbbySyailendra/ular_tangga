export interface RollInput {
  /** lemparan sempurna (bar tenaga dilepas di zona hijau) */
  boost: boolean;
}

/** Pemain manusia: giliran menunggu sampai tombol dadu / Spasi dilepas. */
export class HumanController {
  private resolver: ((input: RollInput) => void) | null = null;

  requestRoll(): Promise<RollInput> {
    return new Promise((resolve) => {
      this.resolver = resolve;
    });
  }

  get waiting(): boolean {
    return this.resolver !== null;
  }

  trigger(input: RollInput): boolean {
    if (!this.resolver) return false;
    const r = this.resolver;
    this.resolver = null;
    r(input);
    return true;
  }

  cancel(): void {
    this.resolver = null;
  }
}
