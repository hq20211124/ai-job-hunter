#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
从打分后的岗位池里，二次收紧成一份「可以放心投」的投递队列。

流水线里的位置:

    scrape-jobs.js   →  data/gd-jobs.json            (原始抓取)
    rank-jobs.py     →  data/jobs-ranked.json        (过滤 + 打分 + 排序)
    build-queue.py   →  data/jobs-queue.json         (二次收紧，喂给投递脚本)  ← 本脚本

用法:
    python build-queue.py                       # 用默认路径
    python build-queue.py --in data/jobs-ranked.json --out data/jobs-queue.json
    python build-queue.py --min-score 2         # 只保留匹配度 >= 2 的

筛选规则来自 agent/filters.json（和 JS 脚本共用同一份），改名单只改那一个文件。

为什么需要「二次收紧」这一步：
    打分脚本只做「明显的坏岗位」过滤（实习/外包/兼职），
    但实际投递前还要挡掉三类：
      1. 外包 / 人力 / 派遣公司（投了也是白投）
      2. 非开发岗（BOSS 标题里带「高级」的不一定是开发）
      3. 级别严重不符（初级/应届/校招）
    另外「投递」有每日上限，把配额留给最匹配的岗位更划算。
"""
import argparse
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
CFG_PATH = os.path.join(HERE, 'filters.json')


def load_filters():
    with open(CFG_PATH, encoding='utf-8') as f:
        return json.load(f)


def main():
    ap = argparse.ArgumentParser(description='从打分结果生成投递队列')
    ap.add_argument('--in', dest='inp',
                    default=os.path.join(ROOT, 'data', 'jobs-ranked.json'),
                    help='打分后的岗位池 (默认 data/jobs-ranked.json)')
    ap.add_argument('--out', dest='out',
                    default=os.path.join(ROOT, 'data', 'jobs-queue.json'),
                    help='输出的投递队列 (默认 data/jobs-queue.json)')
    ap.add_argument('--report', dest='report',
                    default=os.path.join(ROOT, 'data', 'queue-review.txt'),
                    help='剔除原因报告 (默认 data/queue-review.txt)')
    ap.add_argument('--min-score', type=int, default=None,
                    help='匹配度门槛；默认取 filters.json 里的 defaultMinScore（通常为 0）')
    args = ap.parse_args()

    cfg = load_filters()
    min_score = args.min_score if args.min_score is not None else cfg.get('defaultMinScore', 0)

    with open(args.inp, encoding='utf-8-sig') as f:
        pool = json.load(f)
    if isinstance(pool, dict):
        pool = pool.get('jobs') or pool.get('items') or []

    dev_re = re.compile(cfg['devTitleHint'], re.I)
    company_re = [re.compile(p, re.I) for p in cfg.get('excludeCompany', [])]
    company_strict_re = [re.compile(p, re.I) for p in cfg.get('excludeCompanyStrict', [])]
    company_odd_re = [re.compile(p, re.I) for p in cfg.get('excludeCompanyOdd', [])]
    title_re = [re.compile(p, re.I) for p in cfg.get('excludeTitle', [])]

    queue, dropped = [], []
    for job in pool:
        title = (job.get('title') or '').strip()
        company = (job.get('company') or '').strip()
        score = job.get('_score', 0)
        reasons = []

        if not title:
            reasons.append('无标题')
        else:
            if not dev_re.search(title):
                reasons.append('不是开发岗')
            for p in title_re:
                if p.search(title):
                    reasons.append('标题命中排除规则:' + p.pattern)
                    break
        for p in company_strict_re:
            if p.search(company):
                reasons.append('公司命中严格黑名单:' + p.pattern)
                break
        if not reasons:
            for p in company_re:
                if p.search(company):
                    reasons.append('公司名命中外包黑名单:' + p.pattern)
                    break
        if not reasons:
            for p in company_odd_re:
                if p.search(company):
                    reasons.append('非软件行业挂IT岗:' + p.pattern)
                    break
        if score is None or score < min_score:
            reasons.append(f'匹配度低于门槛({score} < {min_score})')

        (dropped if reasons else queue).append((job, reasons))

    # 按匹配度倒序，高分先投
    queue.sort(key=lambda t: -(t[0].get('_score') or 0))

    lines = [
        f"岗位池 {len(pool)} → 投递队列 {len(queue)} / 剔除 {len(dropped)}"
        f"（匹配度门槛 {min_score}）",
        '',
        '=' * 100,
        '=== 投递队列（按匹配度） ===',
        '=' * 100,
    ]
    for n, (job, _) in enumerate(queue, 1):
        lines.append(
            f"{n:>3}. [{job.get('_score')}分] {job.get('city')} | {job.get('title')}\n"
            f"       {job.get('company')} | {job.get('location')}\n"
            f"       {job.get('url')}"
        )
    lines += ['', '=' * 100, '=== 剔除清单（配合人工复核） ===', '=' * 100]
    for job, reasons in dropped:
        lines.append(
            f"[{job.get('_score')}分] {job.get('city')} | {job.get('title')} | "
            f"{job.get('company')} | {','.join(reasons)}"
        )

    for path_, content in ((args.out, None), (args.report, '\n'.join(lines))):
        os.makedirs(os.path.dirname(path_), exist_ok=True)
    with open(args.out, 'w', encoding='utf-8') as f:
        json.dump([j for j, _ in queue], f, ensure_ascii=False, indent=2)
    with open(args.report, 'w', encoding='utf-8') as f:
        f.write('\n'.join(lines))

    print(lines[0])
    print(f"→ {args.out}")
    print(f"→ {args.report}")
    if queue:
        print('\n前 10 个：')
        for n, (job, _) in enumerate(queue[:10], 1):
            print(f"  {n:>2}. [{job.get('_score')}分] {job.get('city')} | {job.get('title')} | {job.get('company')}")


if __name__ == '__main__':
    main()
