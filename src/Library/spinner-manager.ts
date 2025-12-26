import { createSpinner } from "nanospinner";

export class SpinnerManager {
  private spinnerEnabled = true;
  private spinner: any;

  constructor(initialEnabled: boolean = true) {
    this.spinnerEnabled = initialEnabled;
    this.spinner = createSpinner("", { color: "green" });
  }

  // --- Toggle / State Management ---

  toggle(): void {
    this.spinnerEnabled = !this.spinnerEnabled;
  }

  enable(): void {
    this.spinnerEnabled = true;
  }

  disable(): void {
    this.spinnerEnabled = false;
  }

  isEnabled(): boolean {
    return this.spinnerEnabled;
  }

  // --- Spinner Proxy Methods ---

  start(message?: string): void {
    if (this.spinnerEnabled) {
      this.spinner.start(message);
    } else {
      console.log(message);
    }
  }

  stop(): void {
    if (this.spinnerEnabled) this.spinner.stop();
  }

  success(message?: string): void {
    if (this.spinnerEnabled) {
      this.spinner.success(message);
    } else {
      console.log(message);
    }
  }

  error(message?: string): void {
    if (this.spinnerEnabled) {
      this.spinner.error(message);
    } else {
      console.log(message);
    }
  }

  warn(message?: string): void {
    if (this.spinnerEnabled) {
      this.spinner.warn(message);
    } else {
      console.log(message);
    }
  }

  info(message?: string): void {
    if (this.spinnerEnabled) {
      this.spinner.info(message);
    } else {
      console.log(message);
    }
  }

  update(message?: string): void {
    if (this.spinnerEnabled) {
      this.spinner.update(message);
    } else {
      console.log(message);
    }
  }

  reset(): void {
    if (this.spinnerEnabled) this.spinner.reset();
  }

  clear(): void {
    if (this.spinnerEnabled) this.spinner.clear();
  }

  spin(): void {
    if (this.spinnerEnabled) this.spinner.spin();
  }

  loop(): void {
    if (this.spinnerEnabled) this.spinner.loop();
  }

  write(message: string): void {
    if (this.spinnerEnabled) {
      this.spinner.write(message);
    } else {
      console.log(message);
    }
  }

  render(): void {
    if (this.spinnerEnabled) this.spinner.render();
  }

  isSpinning(): boolean {
    if (!this.spinnerEnabled) return false;
    return this.spinner.isSpinning();
  }
}
