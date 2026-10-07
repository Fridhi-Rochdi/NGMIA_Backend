import { AiEngineService } from './ai-engine.service';

const okOpenAi = { ok: true, status: 200, json: async () => ({ data: [{ b64_json: 'AAAA' }] }) };

describe('image provider selection', () => {
  const env = { ...process.env };
  const realFetch = global.fetch;
  let fetchMock: jest.Mock;
  let warn: jest.SpyInstance;

  beforeEach(() => {
    process.env.OPENAI_API_KEY = 'test-openai';
    process.env.NVIDIA_NIM_API_KEY = 'test-nvidia';
    delete process.env.IMAGE_PROVIDER;
    // One try per provider unless a test says otherwise: retries wait seconds.
    process.env.OPENAI_IMAGE_ATTEMPTS = '1';
    fetchMock = jest.fn();
    (global as any).fetch = fetchMock;
    warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => {
    process.env = { ...env };
    // Restore the real fetch: other suites in the same worker rely on it.
    (global as any).fetch = realFetch;
    warn.mockRestore();
  });

  it('uses OpenAI first in auto mode, with the closest supported size', async () => {
    fetchMock.mockResolvedValue(okOpenAi);
    const url = await new AiEngineService().generateImage({ prompt: 'a loaf', size: '1344x768' } as any);
    expect(url).toBe('data:image/png;base64,AAAA');
    const [endpoint, init] = fetchMock.mock.calls[0];
    expect(endpoint).toContain('/images/generations');
    expect(JSON.parse(init.body)).toMatchObject({ model: 'gpt-image-2', size: '1536x1024' });
  });

  it('falls back to NVIDIA when OpenAI is unavailable', async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: false, status: 503, json: async () => ({ error: { message: 'down' } }) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ artifacts: [{ base64: 'BBBB', finishReason: 'SUCCESS' }] }) });
    const url = await new AiEngineService().generateImage({ prompt: 'a loaf', size: '1024x1024' } as any);
    expect(url).toContain('BBBB');
    expect(fetchMock.mock.calls[1][0]).toContain('flux');
  });

  it('retries a transient OpenAI error before falling back', async () => {
    process.env.OPENAI_IMAGE_ATTEMPTS = '2';
    jest.useFakeTimers();
    fetchMock
      .mockResolvedValueOnce({ ok: false, status: 429, json: async () => ({ error: { message: 'Rate limit reached' } }) })
      .mockResolvedValueOnce(okOpenAi);
    const pending = new AiEngineService().generateImage({ prompt: 'a loaf', size: '1024x1024' } as any);
    await jest.advanceTimersByTimeAsync(5000);
    await expect(pending).resolves.toBe('data:image/png;base64,AAAA');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][0]).toContain('/images/generations');
    jest.useRealTimers();
  });

  it('does not retry an empty balance, and says so', async () => {
    process.env.OPENAI_IMAGE_ATTEMPTS = '3';
    delete process.env.NVIDIA_NIM_API_KEY;
    fetchMock.mockResolvedValue({
      ok: false, status: 429,
      json: async () => ({ error: { code: 'credit_balance_exhausted', message: 'Your credit balance is too low' } }),
    });
    await expect(new AiEngineService().generateImage({ prompt: 'x', size: '1024x1024' } as any)).rejects.toThrow(/credit du fournisseur IA est epuise/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not retry a safety refusal on the other provider', async () => {
    fetchMock.mockResolvedValue({
      ok: false, status: 400,
      json: async () => ({ error: { code: 'moderation_blocked', message: 'rejected by the safety system' } }),
    });
    await expect(new AiEngineService().generateImage({ prompt: 'x', size: '1024x1024' } as any)).rejects.toThrow(
      /filtre du fournisseur/,
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('honours IMAGE_PROVIDER=nvidia', async () => {
    process.env.IMAGE_PROVIDER = 'nvidia';
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ artifacts: [{ base64: 'CCCC', finishReason: 'SUCCESS' }] }) });
    await new AiEngineService().generateImage({ prompt: 'x', size: '1024x1024' } as any);
    expect(fetchMock.mock.calls[0][0]).toContain('flux');
  });
});
