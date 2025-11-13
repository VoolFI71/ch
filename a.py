import sys


def largest_rectangle_area(heights):
    stack = []
    max_area = 0

    for i, h in enumerate(heights):
        start = i
        while stack and stack[-1][1] > h:
            idx, height = stack.pop()
            area = height * (i - idx)
            if area > max_area:
                max_area = area
            start = idx
        stack.append((start, h))

    n = len(heights)
    for idx, height in stack:
        area = height * (n - idx)
        if area > max_area:
            max_area = area

    return max_area


def main():
    data = list(map(int, sys.stdin.buffer.read().split()))
    if not data:
        return
    n = data[0]
    heights = data[1:1 + n]
    if len(heights) < n:
        # Недостаточно данных, но согласно условию это не должно происходить
        # Выведем максимум из того, что есть.
        n = len(heights)

    print(largest_rectangle_area(heights))


if __name__ == "__main__":
    main()
