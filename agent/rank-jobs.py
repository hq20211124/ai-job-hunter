# -*- coding: utf-8 -*-
"""
岗位过滤 + 匹配度打分

用法:
    python rank-jobs.py <输入.json> [输出.json]

输入格式: [{"title":..., "company":..., "location":..., "city":..., "url":...}, ...]
输出格式: 同上，但每条多加 _score（匹配分）和 _hits（命中的加分项）

按自己的情况改下面三组规则即可。
"""
import json
import re
import sys
import collections

# ---- 排除规则 ----
# 职位名里出现这些词就丢弃
EXCLUDE_TITLE = [
    r'外包', r'驻场', r'派遣', r'人力', r'兼职', r'实习',
    r'销售', r'产品经理', r'运营', r'测试', r'前端', r'UI', r'实施', r'运维',
]
# 公司名里出现这些词就丢弃（常见人力外包公司）
EXCLUDE_COMPANY = [
    r'人力资源', r'人才服务', r'劳务', r'外服',
    # 按需补充: r'中软', r'软通', r'法本', ...
]
# 职位名里出现这些词就丢弃（异地 base）
EXCLUDE_LOC = [r'base\s*(?!本地)', r'长沙', r'武汉', r'成都', r'西安', r'上海', r'北京']

# ---- 加分关键词（按目标岗位画像调整）----
# 格式: '标签': (正则, 分值)
SCORE = {
    '金融/证券/期货/基金': (r'金融|证券|期货|基金|量化|投研|资管|理财|银行|保险|支付', 5),
    'AI/大模型/智能体':    (r'AI|人工智能|大模型|LLM|智能体|LangChain|Agent', 5),
    '架构/技术负责人':      (r'架构|技术负责人|组长|Leader|技术经理|Team', 4),
    '微服务/SpringCloud':  (r'微服务|Spring\s*Cloud|SpringCloud|Nacos|分布式', 3),
    '工业/MES/WMS/制造':   (r'MES|WMS|制造|工业|仓储|生产|供应链|ERP', 3),
    '高并发/性能调优':      (r'高并发|性能调优|JVM|调优|高可用', 3),
    '数据/大数据/Kafka':    (r'Kafka|大数据|数据平台|数仓|Flink|Spark', 2),
    '国企/央企/政务':       (r'国企|央企|政务|电网|电力|集团', 2),
    '中高级/资深':          (r'高级|资深|Senior|专家', 2),
}


def should_exclude(job):
    """返回排除原因；不排除则返回 None"""
    title = job.get('title', '')
    company = job.get('company', '')
    for p in EXCLUDE_TITLE:
        if re.search(p, title, re.I):
            return f'职位含"{p}"'
    for p in EXCLUDE_COMPANY:
        if re.search(p, company, re.I):
            return f'公司含"{p}"（疑似外包）'
    for p in EXCLUDE_LOC:
        if re.search(p, title, re.I):
            return f'职位含"{p}"（疑似异地 base）'
    return None


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)

    src = sys.argv[1]
    dst = sys.argv[2] if len(sys.argv) > 2 else src.replace('.json', '-ranked.json')

    jobs = json.load(open(src, encoding='utf-8'))
    kept, dropped = [], []

    for job in jobs:
        why = should_exclude(job)
        if why:
            job['_reason'] = why
            dropped.append(job)
            continue
        haystack = ' '.join(str(job.get(k, '')) for k in ('title', 'company', 'location', 'city'))
        score, hits = 0, []
        for label, (pat, pts) in SCORE.items():
            if re.search(pat, haystack, re.I):
                score += pts
                hits.append(label)
        job['_score'] = score
        job['_hits'] = hits
        kept.append(job)

    kept.sort(key=lambda x: -x['_score'])

    print(f'原始 {len(jobs)} 条 → 排除 {len(dropped)} 条 → 保留 {len(kept)} 条\n')

    print('=== 排除原因分布 ===')
    reasons = collections.Counter(
        x['_reason'].split('"')[1] if '"' in x['_reason'] else x['_reason'] for x in dropped
    )
    for reason, n in reasons.most_common(10):
        print(f'  {reason}: {n}')

    print('\n' + '=' * 90)
    print('=== 按匹配度排序 TOP 30 ===')
    print('=' * 90)
    for i, job in enumerate(kept[:30], 1):
        city = job.get('city', '')
        print(f"{i:>3}. [{job['_score']:>2}分] [{city}] {job.get('title', '')}")
        print(f"       {job.get('company', '')} | {job.get('location', '')} | {' / '.join(job['_hits'][:4])}")

    json.dump(kept, open(dst, 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
    print(f'\n完整排序清单 → {dst}（{len(kept)} 条）')


if __name__ == '__main__':
    main()
