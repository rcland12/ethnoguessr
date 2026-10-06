<script lang="ts">
	import 'leaflet/dist/leaflet.css';
	import countriesUrl from 'world-atlas/countries-50m.json?url';
	import type { Map as LeafletMap, LayerGroup, CircleMarker } from 'leaflet';
	import { onMount, untrack } from 'svelte';

	type Point = { lat: number; lng: number };

	let {
		guess = $bindable(null),
		answer = null,
		locked = false
	}: {
		guess?: Point | null;
		/** Set on reveal: draws the answer, its full-points radius and the line from the guess. */
		answer?: (Point & { radiusKm?: number }) | null;
		/** No new pins once the round is revealed. */
		locked?: boolean;
	} = $props();

	let el: HTMLDivElement;
	let map: LeafletMap | null = $state(null);
	let L: typeof import('leaflet') | null = null;
	let guessMarker: CircleMarker | null = null;
	let revealLayer: LayerGroup | null = null;

	const WORLD_VIEW: [number, number] = [25, 10];

	// Leaflet writes these as SVG attributes, where CSS variables don't resolve,
	// so they mirror the tokens in app.css by value.
	const C = {
		land: '#f3ecdc',
		border: '#a99e86',
		pin: '#c4552d',
		answer: '#2f7a5b',
		ink: '#1d2b2a'
	};

	onMount(() => {
		let disposed = false;
		let ro: ResizeObserver | null = null;

		(async () => {
			L = await import('leaflet');
			if (disposed) return;

			const m = L.map(el, {
				center: WORLD_VIEW,
				zoom: 2,
				minZoom: 1,
				maxZoom: 8,
				zoomSnap: 0.25,
				zoomDelta: 0.5,
				wheelPxPerZoomLevel: 90,
				attributionControl: false,
				// One copy of the world; a little slack so edge countries are clickable.
				maxBounds: [
					[-80, -200],
					[86, 200]
				],
				maxBoundsViscosity: 1
			});

			// Land drawn from Natural Earth (via world-atlas) instead of tiles:
			// no third-party tile server, no labels giving the answer away.
			const [topo, { feature }] = await Promise.all([
				fetch(countriesUrl).then((r) => r.json()),
				import('topojson-client')
			]);
			if (disposed) return;
			const countries = feature(topo, topo.objects.countries);
			L.geoJSON(countries, {
				interactive: false,
				style: {
					color: C.border,
					weight: 0.7,
					fillColor: C.land,
					fillOpacity: 1
				}
			}).addTo(m);

			m.on('click', (e) => {
				if (locked) return;
				const p = e.latlng.wrap();
				guess = { lat: p.lat, lng: p.lng };
			});

			ro = new ResizeObserver(() => m.invalidateSize());
			ro.observe(el);
			map = m;
		})();

		return () => {
			disposed = true;
			ro?.disconnect();
			map?.remove();
			map = null;
		};
	});

	// Keep the guess pin in sync with `guess`.
	$effect(() => {
		if (!map || !L) return;
		const g = guess;
		if (!g) {
			guessMarker?.remove();
			guessMarker = null;
			return;
		}
		if (!guessMarker) {
			guessMarker = L.circleMarker([g.lat, g.lng], {
				radius: 8,
				color: '#fff',
				weight: 2.5,
				fillColor: C.pin,
				fillOpacity: 1
			}).addTo(map);
		} else {
			guessMarker.setLatLng([g.lat, g.lng]);
		}
	});

	// Draw (or clear) the reveal, and frame both points.
	$effect(() => {
		if (!map || !L) return;
		revealLayer?.remove();
		revealLayer = null;
		const a = answer;
		if (!a) {
			map.setView(WORLD_VIEW, 2, { animate: false });
			return;
		}

		const layer = L.layerGroup();
		if (a.radiusKm) {
			L.circle([a.lat, a.lng], {
				radius: a.radiusKm * 1000,
				color: C.answer,
				weight: 1.5,
				dashArray: '4 4',
				fillColor: C.answer,
				fillOpacity: 0.12,
				interactive: false
			}).addTo(layer);
		}
		L.circleMarker([a.lat, a.lng], {
			radius: 9,
			color: '#fff',
			weight: 2.5,
			fillColor: C.answer,
			fillOpacity: 1
		}).addTo(layer);

		// Untracked: the reveal shouldn't re-run (and re-frame) when the pin moves.
		const g = untrack(() => guess);
		if (g) {
			L.polyline(
				[
					[g.lat, g.lng],
					[a.lat, a.lng]
				],
				{ color: C.ink, weight: 2, dashArray: '6 6', opacity: 0.7 }
			).addTo(layer);
			map.flyToBounds(
				L.latLngBounds([
					[g.lat, g.lng],
					[a.lat, a.lng]
				]),
				{ padding: [60, 60], maxZoom: 5, duration: 0.8 }
			);
		} else {
			map.flyTo([a.lat, a.lng], 4, { duration: 0.8 });
		}
		layer.addTo(map);
		revealLayer = layer;
	});
</script>

<div bind:this={el} class="absolute inset-0"></div>
