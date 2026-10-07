import { ServiceUnavailableException } from '@nestjs/common';
import * as fs from 'fs';
import { MailService } from './mail.service';

jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  mkdirSync: jest.fn(),
  writeFileSync: jest.fn(),
}));

const message = { to: 'someone@example.test', subject: 'Code', text: '123456' };

function smtpService(sendMail: jest.Mock): MailService {
  const svc = new MailService();
  (svc as any).transporter = { sendMail };
  jest.spyOn(svc as any, 'mode', 'get').mockReturnValue('smtp');
  (svc as any).logger = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };
  return svc;
}

describe('MailService SMTP failures', () => {
  const env = process.env.NODE_ENV;
  afterEach(() => {
    process.env.NODE_ENV = env;
    jest.clearAllMocks();
  });

  it('sends through SMTP when it works', async () => {
    const sendMail = jest.fn().mockResolvedValue({});
    await smtpService(sendMail).send(message);
    expect(sendMail).toHaveBeenCalledTimes(1);
    expect(fs.writeFileSync).not.toHaveBeenCalled();
  });

  it('falls back to the file outbox outside production', async () => {
    process.env.NODE_ENV = 'development';
    const error = Object.assign(new Error('Invalid login: 535-5.7.8 Username and Password not accepted'), {
      code: 'EAUTH',
    });
    const svc = smtpService(jest.fn().mockRejectedValue(error));
    await expect(svc.send(message)).resolves.toBeUndefined();
    expect(fs.writeFileSync).toHaveBeenCalledTimes(1);
    expect(String((fs.writeFileSync as jest.Mock).mock.calls[0][1])).toContain('123456');
  });

  it('fails with a readable 503 in production, never a raw 500', async () => {
    process.env.NODE_ENV = 'production';
    const svc = smtpService(jest.fn().mockRejectedValue(new Error('Invalid login: 535')));
    await expect(svc.send(message)).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(fs.writeFileSync).not.toHaveBeenCalled();
  });
});
