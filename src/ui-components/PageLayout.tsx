import Typography from "@mui/material/Typography";
import NavBar from "./NavBar";

type Props = {
    children?: React.ReactNode;
};

export const PageLayout: React.FC<Props> = ({children}) => {
    return (
        <>
            <NavBar />
            <br/>
            {children}
        </>
    );
};