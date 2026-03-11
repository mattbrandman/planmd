import { SignIn } from "@clerk/tanstack-react-start";

export default function SignInPage() {
	return (
		<main className="flex min-h-[80vh] items-center justify-center px-4">
			<SignIn />
		</main>
	);
}
