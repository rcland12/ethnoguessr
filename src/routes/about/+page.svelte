<svelte:head>
	<title>About · Ethnoguessr 2.0</title>
</svelte:head>

<article class="mx-auto w-full max-w-2xl px-4 py-12 leading-relaxed">
	<h1 class="font-serif text-4xl font-semibold">About</h1>

	<h2 class="mt-10 font-serif text-2xl font-semibold">What you’re looking at</h2>
	<p class="mt-3 text-ink-soft">
		Each face is a <em>composite</em>: up to 80 photos of different people, averaged. No
		composite is a real person. Individual quirks cancel out, and the features those people tend
		to share stand out.
	</p>
	<ol class="mt-4 list-decimal space-y-2 pl-5 text-ink-soft">
		<li>
			Faces are found in each photo, and 478 landmarks are placed on each one: eyes, brows,
			nose, lips, jaw. Photos are skipped if the head is turned or tilted, the face is small or
			blurry, more than one person is prominent, or the photo is black-and-white.
		</li>
		<li>
			Every face is lined up by the eyes, then warped so its features land on the group’s
			average face shape.
		</li>
		<li>
			The warped faces are averaged pixel by pixel, in linear light so skin tones mix the way
			light does. Hair and shoulders are cut out from each photo’s background before
			averaging, and the result is placed on a plain studio backdrop.
		</li>
		<li>
			Photos with extreme color casts (stage lighting, filters) are dropped. Sharper,
			higher-resolution photos count a little more.
		</li>
	</ol>

	<h2 class="mt-10 font-serif text-2xl font-semibold">Where the photos come from</h2>
	<p class="mt-3 text-ink-soft">
		Freely licensed portraits from Wikimedia Commons, linked to birthplaces through Wikidata.
		Rounds are grouped by <strong>where people were born</strong>, not by ethnicity or ancestry.
		That’s something the sources actually record, and it keeps the game about geography. Every
		round links to the credits for its source photos.
	</p>

	<h2 class="mt-10 font-serif text-2xl font-semibold">Things to keep in mind</h2>
	<ul class="mt-3 list-disc space-y-2 pl-5 text-ink-soft">
		<li>
			The people in these photos are mostly public figures: politicians, athletes, performers.
			They aren’t a random sample of anywhere.
		</li>
		<li>
			Birthplace isn’t heritage. Big, diverse countries average out to faces that don’t look
			like any one community there.
		</li>
		<li>
			Photo conditions (lighting, cameras, the era) affect apparent skin tone, and averaging
			only partly corrects for that.
		</li>
	</ul>

	<h2 class="mt-10 font-serif text-2xl font-semibold">Open source</h2>
	<p class="mt-3 text-ink-soft">
		The site and the pipeline that builds the faces are on
		<a href="https://github.com/rcland12/ethnoguessr" target="_blank" rel="noopener" class="underline"
			>GitHub</a
		>, MIT-licensed. The photos and composites aren’t in the repository; the pipeline rebuilds them
		from Wikidata and Wikimedia Commons.
	</p>

	<h2 class="mt-10 font-serif text-2xl font-semibold">Scoring</h2>
	<p class="mt-3 text-ink-soft">
		Up to 5,000 points per round. The answer is the most central birthplace among the photos
		used, and the shaded circle around it is worth full points. Beyond the circle, points fall
		off with distance: about 1,500 km further out is worth roughly a third.
	</p>
</article>
