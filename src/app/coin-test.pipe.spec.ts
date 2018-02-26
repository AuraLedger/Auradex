import { CoinTestPipe } from './coin-test.pipe';

describe('CoinTestPipe', () => {
  it('create an instance', () => {
    const pipe = new CoinTestPipe();
    expect(pipe).toBeTruthy();
  });
});
