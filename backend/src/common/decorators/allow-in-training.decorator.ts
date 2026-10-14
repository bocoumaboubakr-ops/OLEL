import { SetMetadata } from '@nestjs/common';

export const ALLOW_IN_TRAINING_KEY = 'allowInTraining';

/**
 * Ouvre une route aux comptes IN_TRAINING (sentinelle invitée qui suit ses
 * formations). Toutes les autres routes authentifiées leur sont refusées.
 */
export const AllowInTraining = () => SetMetadata(ALLOW_IN_TRAINING_KEY, true);
