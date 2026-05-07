import './node-shims.js';
import { makeReferrer } from './test-helpers.js';

const ctx = await makeReferrer('browser');
console.log(JSON.stringify({
  email: ctx.email,
  password: ctx.password,
  practitionerId: ctx.practitioner.id,
}, null, 2));
