import { useMutation } from "@tanstack/react-query";

import { submitBacktest, type BacktestRequest } from "./api";

export function useRunBacktest() {
  return useMutation({
    mutationFn: (request: BacktestRequest) => submitBacktest(request),
  });
}
