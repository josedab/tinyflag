defmodule TinyFlag do
  @moduledoc """
  TinyFlag Elixir binding — pure Elixir evaluator compatible with WASM module.

  ## Usage

      config = File.read!("flags.json") |> Jason.decode!()
      TinyFlag.is_enabled?(config, "my-flag", %{userId: "user-123"})
  """

  @doc "Check if a flag is enabled."
  def is_enabled?(config, flag_name, context \\ %{}) do
    flags = config["flags"] || config
    flag = Map.get(flags, flag_name)

    cond do
      is_nil(flag) -> false
      not flag["enabled"] -> false
      not is_nil(flag["rollout"]) and Map.has_key?(context, :userId) ->
        bucket = rollout_bucket(flag_name, to_string(context[:userId]))
        bucket < flag["rollout"]
      true -> true
    end
  end

  @doc "Get variant assignment for a flag."
  def get_variant(config, flag_name, context \\ %{}) do
    flags = config["flags"] || config
    flag = Map.get(flags, flag_name)

    cond do
      is_nil(flag) -> nil
      is_nil(flag["variants"]) or flag["variants"] == [] -> nil
      not is_enabled?(config, flag_name, context) -> nil
      true ->
        user_id = to_string(Map.get(context, :userId, ""))
        select_variant(flag_name, user_id, flag["variants"])
    end
  end

  @doc "MurmurHash3 32-bit (cross-language compatible)."
  def murmurhash3(key, seed \\ 0) do
    bytes = :binary.bin_to_list(key)
    len = length(bytes)
    h = band(seed, 0xFFFFFFFF)

    {h, remaining} = process_blocks(bytes, h)
    h = process_remainder(remaining, h)

    h = band(bxor(h, len), 0xFFFFFFFF)
    h = band(bxor(h, bsr(h, 16)), 0xFFFFFFFF)
    h = band(h * 0x85ebca6b, 0xFFFFFFFF)
    h = band(bxor(h, bsr(h, 13)), 0xFFFFFFFF)
    h = band(h * 0xc2b2ae35, 0xFFFFFFFF)
    band(bxor(h, bsr(h, 16)), 0xFFFFFFFF)
  end

  def rollout_bucket(flag_name, user_id, seed \\ 0) do
    h = murmurhash3("#{flag_name}:#{user_id}", seed)
    rem(h, 100)
  end

  defp select_variant(flag_name, user_id, variants) do
    total_weight = Enum.sum(Enum.map(variants, & &1["weight"]))

    if total_weight == 0 do
      hd(variants)["name"]
    else
      h = murmurhash3("#{flag_name}:#{user_id}", 0x5f3759df)
      bucket = rem(h, total_weight)

      Enum.reduce_while(variants, 0, fn v, acc ->
        cumulative = acc + v["weight"]
        if bucket < cumulative, do: {:halt, v["name"]}, else: {:cont, cumulative}
      end)
    end
  end

  defp process_blocks(bytes, h) when length(bytes) >= 4 do
    [b0, b1, b2, b3 | rest] = bytes
    k = bor(bor(bor(b0, bsl(b1, 8)), bsl(b2, 16)), bsl(b3, 24))
    k = band(k * 0xcc9e2d51, 0xFFFFFFFF)
    k = band(bor(bsl(k, 15), bsr(k, 17)), 0xFFFFFFFF)
    k = band(k * 0x1b873593, 0xFFFFFFFF)
    h = band(bxor(h, k), 0xFFFFFFFF)
    h = band(bor(bsl(h, 13), bsr(h, 19)), 0xFFFFFFFF)
    h = band(h * 5 + 0xe6546b64, 0xFFFFFFFF)
    process_blocks(rest, h)
  end

  defp process_blocks(remaining, h), do: {h, remaining}

  defp process_remainder([], h), do: h
  defp process_remainder(remaining, h) do
    k = Enum.with_index(remaining)
      |> Enum.reduce(0, fn {byte, idx}, acc -> bor(acc, bsl(byte, idx * 8)) end)
    k = band(k * 0xcc9e2d51, 0xFFFFFFFF)
    k = band(bor(bsl(k, 15), bsr(k, 17)), 0xFFFFFFFF)
    k = band(k * 0x1b873593, 0xFFFFFFFF)
    band(bxor(h, k), 0xFFFFFFFF)
  end

  import Bitwise
end
