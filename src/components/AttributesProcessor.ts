const DATE_FIELD_RE = /^(\d{4}-\d{2}-\d{2})$/;

export class AttributesProcessor {
	/**
	 * Scans bodyContent for {key: value}, {key = n}, {key += n}, {key -= n} directives.
	 * Mutates frontmatter in-place for each directive found.
	 * Converts each processed directive from {expr} → (expr) in the returned string.
	 * Directives inside code blocks are ignored.
	 */
	processAttributes(
		frontmatter: Record<string, unknown>,
		bodyContent: string
	): string {
		const lines = bodyContent.split('\n');
		let inCodeBlock = false;
		let result = bodyContent;

		for (const line of lines) {
			if (line.trim().startsWith('```')) {
				inCodeBlock = !inCodeBlock;
				continue;
			}
			if (inCodeBlock) continue;

			const start = line.indexOf('{');
			const end = line.indexOf('}');
			if (start === -1 || end === -1 || end <= start) continue;

			const expr = line.slice(start + 1, end).trim();
			const { op, key, value } = this.parseExpression(expr);
			if (!op || !key) continue;

			const current = frontmatter[key];
			frontmatter[key] = this.applyOp(op, key, current, value);

			// Replace {expr} with (expr) in result
			result = result.replace(`{${expr}}`, `(${expr})`);
		}

		return result;
	}

	// ── Private ──────────────────────────────────────────────────────

	private parseExpression(expr: string): { op: string | null; key: string | null; value: string } {
		// Try longer operators first to avoid partial matches
		for (const op of ['-=', '+=', '=', ':']) {
			const idx = expr.indexOf(op);
			if (idx === -1) continue;
			const key = expr.slice(0, idx).trim();
			const value = expr.slice(idx + op.length).trim();
			return { op, key, value };
		}
		return { op: null, key: null, value: '' };
	}

	private applyOp(
		op: string,
		key: string,
		current: unknown,
		value: string
	): unknown {
		const isNumericValue = !isNaN(Number(value)) && value.trim() !== '';

		// Date field handling
		if (typeof current === 'string' && DATE_FIELD_RE.test(current)) {
			if (op === '+=') return this.shiftDate(current, value, 1);
			if (op === '-=') return this.shiftDate(current, value, -1);
		}

		// Numeric operations
		if (isNumericValue && op !== ':') {
			const n = Number(value);
			const cur = typeof current === 'number' ? current : (Number(current) || 0);
			if (op === '=' || op === ':') return n;
			if (op === '+=') return cur + n;
			if (op === '-=') return cur - n;
		}

		// String operations
		if (op === ':' || op === '=') return value;
		if (op === '+=') {
			return current ? `${current},${value}` : value;
		}
		if (op === '-=') {
			return typeof current === 'string'
				? current.split(',').filter(v => v.trim() !== value).join(',')
				: current ?? '';
		}

		return current ?? '';
	}

	private shiftDate(dateStr: string, spec: string, sign: number): string {
		const match = spec.match(/^(\d+)([dw])$/);
		if (!match) return dateStr;

		const amount = parseInt(match[1]!, 10) * sign;
		const unit = match[2]!;

		// Parse as UTC to avoid local-timezone off-by-one errors
		const [y, m, day] = dateStr.split('-').map(Number) as [number, number, number];
		const d = new Date(Date.UTC(y, m - 1, day));

		if (unit === 'd') d.setUTCDate(d.getUTCDate() + amount);
		if (unit === 'w') d.setUTCDate(d.getUTCDate() + amount * 7);

		const yr = d.getUTCFullYear();
		const mo = String(d.getUTCMonth() + 1).padStart(2, '0');
		const da = String(d.getUTCDate()).padStart(2, '0');
		return `${yr}-${mo}-${da}`;
	}
}
