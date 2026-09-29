import logo from '../assets/logo.png'
import logoDark from '../assets/logo-dark.png'

/**
 * Logo della società su sfondo trasparente. Con il tema scuro le scritte blu non si leggerebbero:
 * si usa la versione con le scritte color crema (la scelta la fa il CSS in base al tema).
 */
export function Logo({ className = '', alt = 'Tornei e partite interne tennistavolo' }: { className?: string; alt?: string }) {
  return (
    <span className={`logo ${className}`}>
      <img className="logo-light" src={logo} alt={alt} />
      <img className="logo-dark" src={logoDark} alt={alt} />
    </span>
  )
}
