import { ShapeStream, Shape, type ShapeStreamOptions, type Row } from '@electric-sql/client';

const streamCache = new Map<string, ShapeStream>();
const shapeCache = new Map<ShapeStream, Shape>();

function sortedOptionsHash(options: ShapeStreamOptions): string {
	return JSON.stringify(options, Object.keys(options).sort());
}

function getShapeStream<T extends Row = Row>(options: ShapeStreamOptions): ShapeStream<T> {
	const shapeHash = sortedOptionsHash(options);
	if (!streamCache.has(shapeHash)) {
		streamCache.set(shapeHash, new ShapeStream<T>(options));
	}
	return streamCache.get(shapeHash)! as ShapeStream<T>;
}

function getShape<T extends Row>(shapeStream: ShapeStream<T>): Shape<T> {
	if (!shapeCache.has(shapeStream)) {
		shapeCache.set(shapeStream, new Shape<T>(shapeStream));
	}
	return shapeCache.get(shapeStream)! as Shape<T>;
}

interface ShapeStoreData<T extends Row = Row> {
	data: T[];
	isLoading: boolean;
	lastSyncedAt?: number;
	error: Error | null | Shape['error'];
}

function createShapeStore<T extends Row = Row>(options: ShapeStreamOptions) {
	let data = $state<T[]>([]);
	let isLoading = $state(true);
	let lastSyncedAt = $state<number | undefined>(undefined);
	let error = $state<Error | null | Shape['error']>(null);

	let shape: Shape<T>;

	function initializeShape() {
		const shapeStream = getShapeStream<T>(options);
		shape = getShape<T>(shapeStream);

		shape.subscribe(() => {
			data = Array.from(shape.valueSync?.values() || []);
			isLoading = shape.isLoading();
			lastSyncedAt = shape.lastSyncedAt();
			error = shape.error;
		});

		shape.value
			.then(() => {
				data = Array.from(shape.valueSync?.values() || []);
				isLoading = false;
				lastSyncedAt = shape.lastSyncedAt();
				error = null;
			})
			.catch((e) => {
				data = [];
				isLoading = false;
				error = e;
			});
	}

	return {
		get data() {
			return data;
		},
		get isLoading() {
			return isLoading;
		},
		get lastSyncedAt() {
			return lastSyncedAt;
		},
		get error() {
			return error;
		},
		init: initializeShape
	};
}

export { createShapeStore, getShapeStream, getShape };
