import { isPublicAddress, safeFetchBuffer } from './safe-fetch';

describe('safe-fetch', () => {
  it.each([
    '127.0.0.1',
    '10.1.2.3',
    '172.16.0.1',
    '192.168.1.10',
    '169.254.169.254',
    '100.64.0.1',
    '0.0.0.0',
    '::1',
    'fd00::1',
    'fe80::1',
    '::ffff:127.0.0.1',
  ])('treats %s as internal', (ip) => {
    expect(isPublicAddress(ip)).toBe(false);
  });

  it.each(['8.8.8.8', '151.101.1.69', '2606:4700::1111'])('treats %s as public', (ip) => {
    expect(isPublicAddress(ip)).toBe(true);
  });

  it.each([
    'http://169.254.169.254/latest/meta-data/',
    'http://127.0.0.1:5432/',
    'http://localhost:4000/uploads/x.png',
    'file:///etc/passwd',
    'not a url',
  ])('refuses %s without making the request', async (url) => {
    const spy = jest.spyOn(global, 'fetch');
    await expect(safeFetchBuffer(url)).resolves.toBeNull();
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
