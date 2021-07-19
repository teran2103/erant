const outerMap = new Map();
for(let i = 1; i < 6; i++) {
	const innerMap = new Map();
	for(let j = 1; j < 6; j++) {
		innerMap.set(i * 10, j * 100);
	}
	outerMap.set(i, innerMap);
}
console.log(5 + (undefined || 0));
console.log(outerMap.has('hi'));
